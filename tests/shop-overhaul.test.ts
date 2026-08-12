import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_COMMUNITY_UNO_CARDS,
  JOKER_IDS,
  buyCardPack,
  buyFirmware,
  buyProtocol,
  createRun,
  nextRound,
  takePackChoices,
  useConsumable,
  type JokerInstance,
  type RunState,
  type ShopOffer,
} from "../lib/game/index";
import { TODAY_SIGNAL_WEIGHTS } from "../lib/game/garage-config";
import { jokerSlotLimitFor, nextRoundHandSizeFor } from "../lib/game/run-upgrades";
import { generateShop, rerollShopSignals } from "../lib/game/shop";

function offerById(offers: readonly ShopOffer[], id: string | undefined): ShopOffer {
  assert.ok(id, "expected an offer id");
  const offer = offers.find((candidate) => candidate.id === id);
  assert.ok(offer, `expected offer ${id}`);
  return offer;
}

function withTwoMods(state: RunState): RunState {
  const jokers: JokerInstance[] = JOKER_IDS.slice(0, 2).map((jokerId, index) => ({
    instanceId: `test-mod-${index}`,
    jokerId,
    acquiredRound: 1,
  }));
  return { ...state, jokers };
}

function inShopWith(state: RunState, offers: readonly ShopOffer[]): RunState {
  return {
    ...state,
    phase: "shop",
    shop: {
      id: "test-shop",
      offers,
      soldOfferIds: [],
      rerollCost: 2,
      rerolls: 0,
    },
  };
}

test("builds a deterministic 2 signal + 1 firmware + 2 pack shop", () => {
  const state = createRun({ seed: "shop-shape" });
  const first = generateShop(state);
  const second = generateShop(state);

  assert.deepEqual(first, second);
  assert.equal(first.shop.offers.length, 5);
  assert.equal(first.shop.signalOfferIds?.length, 2);
  assert.equal(first.shop.packOfferIds?.length, 2);
  assert.ok(first.shop.deckLabOfferId);
  assert.equal(new Set(first.shop.offers.map((offer) => offer.id)).size, 5);

  const signalKinds = first.shop.signalOfferIds?.map(
    (id) => offerById(first.shop.offers, id).kind,
  );
  assert.ok(
    signalKinds?.every((kind) =>
      ["joker", "hand-upgrade", "protocol", "community-uno"].includes(kind),
    ),
  );
  assert.equal(
    offerById(first.shop.offers, first.shop.deckLabOfferId).kind,
    "firmware",
  );
  assert.ok(
    first.shop.packOfferIds?.every(
      (id) => offerById(first.shop.offers, id).kind === "card-pack",
    ),
  );
});

test("uses the agreed signal weights and keeps MAYHEM rare", () => {
  assert.deepEqual(TODAY_SIGNAL_WEIGHTS, {
    mod: 45,
    core: 30,
    protocol: 20,
    mayhem: 5,
  });

  let mayhemSignals = 0;
  let totalSignals = 0;
  let ghostPacks = 0;
  for (let index = 0; index < 1_000; index += 1) {
    const state = withTwoMods(createRun({ seed: `signal-rate-${index}` }));
    const generated = generateShop(state);
    for (const id of generated.shop.signalOfferIds ?? []) {
      const offer = offerById(generated.shop.offers, id);
      totalSignals += 1;
      if (offer.kind === "community-uno") mayhemSignals += 1;
      assert.notEqual(offer.kind, "card-pack", "GHOST must not enter Today's Signal");
    }
    for (const id of generated.shop.packOfferIds ?? []) {
      const offer = offerById(generated.shop.offers, id);
      if (offer.kind === "card-pack" && offer.packKind === "ghost") ghostPacks += 1;
    }
  }

  const observedRate = mayhemSignals / totalSignals;
  assert.ok(
    observedRate >= 0.03 && observedRate <= 0.07,
    `expected a roughly 5% MAYHEM rate, observed ${(observedRate * 100).toFixed(2)}%`,
  );
  assert.ok(ghostPacks > 0, "GHOST cards should remain obtainable through Pack Bay");
});

test("guarantees and locks the equipped first-shop MAYHEM until it is bought", () => {
  const starter = DEFAULT_COMMUNITY_UNO_CARDS[0];
  const equipped = DEFAULT_COMMUNITY_UNO_CARDS[1];
  const state = createRun({
    seed: "equipped-mayhem",
    starterUno: starter,
    communityUnoPool: [starter, equipped],
  });
  const generated = generateShop(state);
  assert.equal(generated.shop.lockedSignalOfferIds?.length, 1);

  const lockedId = generated.shop.lockedSignalOfferIds?.[0];
  const lockedOffer = offerById(generated.shop.offers, lockedId);
  assert.equal(lockedOffer.kind, "community-uno");
  assert.ok(lockedOffer.kind === "community-uno");
  assert.equal(lockedOffer.card.id, equipped.id);

  const shopState: RunState = {
    ...state,
    rngState: generated.rngState,
    phase: "shop",
    shop: generated.shop,
  };
  const rerolled = rerollShopSignals(shopState, 1);
  assert.ok(rerolled.shop.lockedSignalOfferIds?.includes(lockedOffer.id));
  assert.strictEqual(
    offerById(rerolled.shop.offers, lockedOffer.id),
    lockedOffer,
    "locked MAYHEM should keep the same offer object and id",
  );
});

test("rerolls only signal slots while fixed offers and their SOLD state persist", () => {
  const run = createRun({ seed: "signal-only-reroll", startingCoins: 99 });
  const generated = generateShop(run);
  const oldSignalIds = generated.shop.signalOfferIds ?? [];
  const deckLabId = generated.shop.deckLabOfferId;
  const packIds = generated.shop.packOfferIds ?? [];
  const fixedIds = [deckLabId, ...packIds].filter(
    (id): id is string => typeof id === "string",
  );
  const fixedOffers = new Map(
    fixedIds.map((id) => [id, offerById(generated.shop.offers, id)]),
  );
  const soldFixedIds = [fixedIds[0], fixedIds[1]];
  const soldSignalId = oldSignalIds[0];
  const state: RunState = {
    ...run,
    phase: "shop",
    rngState: generated.rngState,
    shop: {
      ...generated.shop,
      soldOfferIds: [...soldFixedIds, soldSignalId],
    },
  };

  const first = rerollShopSignals(state, 1);
  const second = rerollShopSignals(state, 1);
  assert.deepEqual(first, second, "a reroll must be deterministic for the same state");
  assert.equal(first.shop.rerollCost, 3);

  for (const [id, oldOffer] of fixedOffers) {
    assert.strictEqual(
      offerById(first.shop.offers, id),
      oldOffer,
      `fixed offer ${id} should be retained, not regenerated`,
    );
  }
  assert.deepEqual(first.shop.deckLabOfferId, deckLabId);
  assert.deepEqual(first.shop.packOfferIds, packIds);
  assert.deepEqual(new Set(first.shop.soldOfferIds), new Set(soldFixedIds));
  assert.ok(
    oldSignalIds.every((id) => !first.shop.signalOfferIds?.includes(id)),
    "non-locked signal slots should be replaced",
  );
});

test("upgrades a legacy flat shop to section metadata on reroll", () => {
  const run = createRun({ seed: "legacy-flat-shop" });
  const generated = generateShop(run);
  const legacyShop = {
    id: generated.shop.id,
    offers: generated.shop.offers,
    soldOfferIds: [generated.shop.deckLabOfferId!],
    rerollCost: generated.shop.rerollCost,
    rerolls: generated.shop.rerolls,
  };
  const state: RunState = {
    ...run,
    phase: "shop",
    rngState: generated.rngState,
    shop: legacyShop,
  };

  const rerolled = rerollShopSignals(state, 1);
  assert.equal(rerolled.shop.signalOfferIds?.length, 2);
  assert.equal(rerolled.shop.packOfferIds?.length, 2);
  assert.ok(rerolled.shop.deckLabOfferId);
  assert.ok(rerolled.shop.soldOfferIds?.includes(generated.shop.deckLabOfferId!));
});

test("buys, stores, and consumes a PROTOCOL from the shared utility rack", () => {
  const offer = {
    id: "test-protocol",
    kind: "protocol" as const,
    protocolId: "emergency-credit" as const,
    price: 3,
  };
  const bought = buyProtocol(inShopWith(createRun({ seed: "protocol-use", startingCoins: 10 }), [offer]), offer.id);
  assert.equal(bought.coins, 7);
  assert.equal(bought.consumables?.length, 1);

  const used = useConsumable(bought, bought.consumables![0].instanceId);
  assert.equal(used.coins, 11);
  assert.deepEqual(used.consumables, []);
  assert.equal(used.actionLog.at(-1)?.type, "use-consumable");
});

test("installs Deck Lab firmware and applies its next-round effect", () => {
  const offer = {
    id: "test-firmware",
    kind: "firmware" as const,
    firmwareId: "hand-memory" as const,
    price: 9,
  };
  const bought = buyFirmware(inShopWith(createRun({ seed: "firmware-use", startingCoins: 20 }), [offer]), offer.id);
  assert.deepEqual(bought.firmware, ["hand-memory"]);
  assert.equal(nextRoundHandSizeFor(bought), 9);

  const advanced = nextRound(bought);
  assert.equal(advanced.hand.length, 9);
  assert.equal(advanced.firmware?.[0], "hand-memory");
});

test("keeps GHOST cards inside packs and applies their tradeoff when used", () => {
  const offer = {
    id: "test-ghost-pack",
    kind: "card-pack" as const,
    packKind: "ghost" as const,
    price: 6,
  };
  const opened = buyCardPack(inShopWith(createRun({ seed: "ghost-pack", startingCoins: 20 }), [offer]), offer.id);
  const ghostChoice = opened.packOpening?.choices[0];
  assert.equal(ghostChoice?.kind, "ghost");
  assert.ok(ghostChoice?.kind === "ghost");

  const stored = takePackChoices(opened, [ghostChoice.id]);
  assert.equal(stored.consumables?.[0]?.kind, "ghost");

  const forbidden = {
    ...stored,
    consumables: [{
      instanceId: "forced-forbidden-port",
      kind: "ghost" as const,
      ghostId: "forbidden-port" as const,
      acquiredRound: stored.roundNumber,
    }],
  };
  const beforeLimit = jokerSlotLimitFor(forbidden);
  const used = useConsumable(forbidden, "forced-forbidden-port");
  assert.equal(jokerSlotLimitFor(used), beforeLimit + 1);
  assert.equal(used.permanentDiscardPenalty, 1);
  assert.deepEqual(used.consumables, []);
});
