import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_COMMUNITY_UNO_CARDS,
  JOKER_IDS,
  UNO_MODULE_CATALOG,
  buyCardPack,
  buyDeckWork,
  buyHandUpgrade,
  choosePackCard,
  claimRoundReward,
  continueEndlessRun,
  createRun,
  drawCards,
  evaluateHand,
  nextRound,
  playHand,
  previewHand,
  rerollShop,
  takePackChoices,
  PackGenerator,
  PACK_DEFINITIONS,
  validateCommunityUnoCard,
  type GameCard,
  type RunState,
} from "../lib/game/index";

function card(id: string, rank: GameCard["rank"], color: GameCard["color"]): GameCard {
  return { id, rank, color };
}

test("creates the deterministic 40-card deck without duplicates", () => {
  const first = createRun({ seed: "same-seed" });
  const second = createRun({ seed: "same-seed" });
  assert.deepEqual(first.hand, second.hand);
  const cards = [...first.hand, ...first.drawPile, ...first.discardPile];
  assert.equal(cards.length, 40);
  assert.equal(new Set(cards.map((item) => item.id)).size, 40);
});

test("detects straight, flush, full house and straight flush", () => {
  assert.equal(evaluateHand([0,1,2,3,4].map((rank) => card(`s${rank}`, rank as GameCard["rank"], "red"))).type, "straight-flush");
  assert.equal(evaluateHand([card("a",2,"red"),card("b",2,"blue"),card("c",2,"green"),card("d",7,"red"),card("e",7,"yellow")]).type, "full-house");
  assert.equal(evaluateHand([card("a",1,"blue"),card("b",3,"blue"),card("c",5,"blue"),card("d",7,"blue"),card("e",9,"blue")]).type, "flush");
  assert.equal(evaluateHand([1,2,3,4,5].map((rank, index) => card(`m${rank}`, rank as GameCard["rank"], ["red","blue","green","yellow","red"][index] as GameCard["color"]))).type, "straight");
});

test("scores zero as 10 chips and does not mutate previews", () => {
  let original = createRun({ seed: "zero-preview-0" });
  for (let attempt = 1; !original.hand.some((item) => item.rank === 0) && attempt < 50; attempt += 1) {
    original = createRun({ seed: `zero-preview-${attempt}` });
  }
  const zero = original.hand.find((item) => item.rank === 0);
  assert.ok(zero);
  const before = JSON.stringify(original);
  const preview = previewHand(original, [zero.id]);
  assert.equal(preview.numericChips, 10);
  assert.equal(preview.total, 15);
  assert.equal(JSON.stringify(original), before);
});

test("ships 43 jokers and balanced one-turn UNO modules", () => {
  assert.equal(JOKER_IDS.length, 43);
  assert.equal(Object.keys(UNO_MODULE_CATALOG).length, 16);
  for (const card of DEFAULT_COMMUNITY_UNO_CARDS) {
    const validation = validateCommunityUnoCard(card);
    assert.equal(validation.valid, true);
    assert.equal(validation.pointTotal, 0);
  }
});

test("finishes standard after 15 cleared rounds and continues endless to ante 6", () => {
  function clearOne(state: RunState): RunState {
    const easy = { ...state, target: 1 };
    return playHand(easy, [easy.hand[0].id]).state;
  }
  let standard = createRun({ seed: "standard-15", mode: "standard" });
  for (let index = 0; index < 15; index += 1) {
    standard = clearOne(standard);
    assert.equal(standard.phase, "reward");
    standard = claimRoundReward(standard);
    if (standard.phase === "shop") standard = nextRound(standard);
  }
  assert.equal(standard.phase, "won");
  assert.equal(standard.ante, 5);

  const continued = continueEndlessRun(standard);
  assert.equal(continued.mode, "endless");
  assert.equal(continued.phase, "shop");
  assert.deepEqual(continued.deck, standard.deck);
  assert.deepEqual(continued.jokers, standard.jokers);
  assert.deepEqual(continued.communityUno, standard.communityUno);
  assert.deepEqual(continued.handLevels, standard.handLevels);
  assert.equal(continued.coins, standard.coins);
  const endlessFromStandard = nextRound(continued);
  assert.equal(endlessFromStandard.phase, "playing");
  assert.equal(endlessFromStandard.ante, 6);
  assert.equal(endlessFromStandard.round, "small");
  assert.equal(endlessFromStandard.target, 4050);
  assert.notEqual(endlessFromStandard.target, 500);

  let endless = createRun({ seed: "endless-15", mode: "endless" });
  for (let index = 0; index < 15; index += 1) {
    endless = clearOne(endless);
    assert.equal(endless.phase, "reward");
    endless = claimRoundReward(endless);
    assert.equal(endless.phase, "shop");
    endless = nextRound(endless);
  }
  assert.equal(endless.phase, "playing");
  assert.equal(endless.ante, 6);
  assert.equal(endless.round, "small");
});

test("keeps discarded cards out of the draw pile until the next round", () => {
  const top = card("top", 3, "red");
  const discarded = card("discarded", 8, "blue");
  const result = drawCards([top], [discarded], 2, 123);
  assert.deepEqual(result.drawn.map((item) => item.id), ["top"]);
  assert.deepEqual(result.discardPile.map((item) => item.id), ["discarded"]);
  assert.equal(result.drawPile.length, 0);
});

test("shows a receipt and pays a cleared-round reward exactly once", () => {
  const run = createRun({ seed: "reward-receipt", startingCoins: 10 });
  const cleared = playHand({ ...run, target: 1 }, [run.hand[0].id]).state;
  assert.equal(cleared.phase, "reward");
  assert.equal(cleared.coins, 10);
  assert.ok(cleared.pendingReward);

  const paid = claimRoundReward(cleared);
  assert.equal(paid.phase, "shop");
  assert.equal(paid.coins, 10 + cleared.pendingReward.total);
  assert.equal(paid.pendingReward, null);
  assert.throws(() => claimRoundReward(paid), /reward 단계/);
});

test("persists deck surgery and enhanced pack cards across rounds", () => {
  const initial = createRun({ seed: "persistent-deck", startingCoins: 99 });
  const reward = playHand({ ...initial, target: 1 }, [initial.hand[0].id]).state;
  let shop = claimRoundReward(reward);
  const target = shop.deck?.[0];
  assert.ok(target);

  shop = {
    ...shop,
    shop: {
      id: "test-garage",
      rerollCost: 2,
      rerolls: 0,
      offers: [
        { id: "charge-offer", kind: "deck-work", work: "charge", price: 0 },
      ],
    },
  };
  shop = buyDeckWork(shop, "charge-offer", target.id);
  assert.equal(shop.deck?.find((item) => item.id === target.id)?.enhancement, "charged");
  assert.ok(shop.shop?.soldOfferIds?.includes("charge-offer"));
  assert.ok(shop.shop?.offers.some((offer) => offer.id === "charge-offer"));
  assert.throws(() => buyDeckWork(shop, "charge-offer", target.id), /판매된/);

  shop = {
    ...shop,
    shop: {
      id: "test-pack-rack",
      rerollCost: 2,
      rerolls: 0,
      offers: [
        { id: "standard-pack", kind: "card-pack", packKind: "standard", price: 0 },
      ],
    },
  };
  const beforePackSize = shop.deck?.length ?? 0;
  shop = buyCardPack(shop, "standard-pack");
  assert.equal(shop.packOpening?.choices.length, 3);
  const chosen = shop.packOpening?.choices[0];
  assert.equal(chosen?.kind, "card");
  assert.ok(chosen && chosen.kind === "card");
  shop = choosePackCard(shop, chosen.card.id);
  assert.equal(shop.deck?.length, beforePackSize + 1);

  const next = nextRound(shop);
  assert.equal(next.deck?.length, beforePackSize + 1);
  assert.equal(next.deck?.find((item) => item.id === target.id)?.enhancement, "charged");
  assert.ok(next.deck?.some((item) => item.id === chosen.card.id));
});

test("generates weighted pack candidates without duplicates and enforces pick counts", () => {
  const kinds = ["standard", "large", "premium", "modifier", "upgrade"] as const;
  for (const kind of kinds) {
    const generated = PackGenerator.generate(kind, `test-${kind}`, 90210);
    assert.equal(generated.choices.length, PACK_DEFINITIONS[kind].revealCount);
    assert.equal(new Set(generated.choices.map((choice) => choice.id)).size, generated.choices.length);
    assert.ok(generated.choices.every((choice) => choice.kind === PACK_DEFINITIONS[kind].contents));
  }

  const initial = createRun({ seed: "large-pack-count", startingCoins: 99 });
  const reward = playHand({ ...initial, target: 1 }, [initial.hand[0].id]).state;
  let shop = claimRoundReward(reward);
  shop = {
    ...shop,
    shop: {
      id: "large-pack-shop",
      rerollCost: 2,
      rerolls: 0,
      soldOfferIds: [],
      offers: [{ id: "large-pack", kind: "card-pack", packKind: "large", price: 0 }],
    },
  };
  shop = buyCardPack(shop, "large-pack");
  assert.equal(shop.packOpening?.pickCount, 2);
  assert.throws(() => takePackChoices(shop, [shop.packOpening!.choices[0].id]), /정확히 2개/);
  const picked = shop.packOpening!.choices.slice(0, 2);
  const before = shop.deck!.length;
  shop = takePackChoices(shop, picked.map((choice) => choice.id));
  assert.equal(shop.deck!.length, before + 2);
});

test("keeps SOLD slots until reroll and raises the reroll price", () => {
  const initial = createRun({ seed: "sold-reroll", startingCoins: 99 });
  const reward = playHand({ ...initial, target: 1 }, [initial.hand[0].id]).state;
  let shop = claimRoundReward(reward);
  const replacedSignalId = shop.shop!.signalOfferIds?.[1] ?? shop.shop!.offers[1].id;
  const offer = { id: "sold-core-test", kind: "hand-upgrade" as const, handType: "pair" as const, price: 0 };
  shop = {
    ...shop,
    shop: {
      ...shop.shop!,
      offers: shop.shop!.offers.map((candidate) => candidate.id === replacedSignalId ? offer : candidate),
      signalOfferIds: shop.shop!.signalOfferIds?.map((id) => id === replacedSignalId ? offer.id : id),
    },
  };
  shop = buyHandUpgrade(shop, offer.id);
  assert.ok(shop.shop!.soldOfferIds?.includes(offer.id));
  assert.ok(shop.shop!.offers.some((candidate) => candidate.id === offer.id));
  const coinsBefore = shop.coins;
  shop = rerollShop(shop);
  assert.equal(shop.coins, coinsBefore - 2);
  assert.equal(shop.shop!.rerollCost, 3);
  assert.deepEqual(shop.shop!.soldOfferIds, []);
});

test("takes modifier and upgrade pack rewards through their own acquisition paths", () => {
  const initial = createRun({ seed: "special-pack-paths", startingCoins: 99 });
  const reward = playHand({ ...initial, target: 1 }, [initial.hand[0].id]).state;
  let shop = claimRoundReward(reward);
  shop = {
    ...shop,
    shop: {
      id: "modifier-shop",
      rerollCost: 2,
      rerolls: 0,
      soldOfferIds: [],
      offers: [{ id: "modifier-pack", kind: "card-pack", packKind: "modifier", price: 0 }],
    },
  };
  shop = buyCardPack(shop, "modifier-pack");
  const modifier = shop.packOpening!.choices[0];
  assert.equal(modifier.kind, "modifier");
  const modCount = shop.jokers.length;
  shop = takePackChoices(shop, [modifier.id]);
  assert.equal(shop.jokers.length, modCount + 1);

  shop = {
    ...shop,
    shop: {
      id: "upgrade-shop",
      rerollCost: 2,
      rerolls: 0,
      soldOfferIds: [],
      offers: [{ id: "upgrade-pack", kind: "card-pack", packKind: "upgrade", price: 0 }],
    },
  };
  shop = buyCardPack(shop, "upgrade-pack");
  const upgrade = shop.packOpening!.choices[0];
  assert.equal(upgrade.kind, "upgrade");
  const target = shop.deck!.find((card) => !card.enhancement);
  assert.ok(target);
  shop = takePackChoices(shop, [upgrade.id], target.id);
  assert.ok(shop.deck!.find((card) => card.id === target.id)?.enhancement);
});

test("consumes and removes a MAYHEM card from communityUno upon play", () => {
  const starter = DEFAULT_COMMUNITY_UNO_CARDS[0];
  const run = createRun({ seed: "uno-consume", starterUno: starter });
  assert.equal(run.communityUno.length, 1);

  const result = playHand(run, [run.hand[0].id], {
    unoCardId: starter.id,
    calledColor: "red",
  });
  assert.equal(result.state.communityUno.length, 0);
  assert.ok(!result.state.communityUno.some((card) => card.id === starter.id));
});
