import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_COMMUNITY_UNO_CARDS,
  JOKER_IDS,
  UNO_MODULE_CATALOG,
  buyCardPack,
  buyDeckWork,
  choosePackCard,
  claimRoundReward,
  createRun,
  drawCards,
  evaluateHand,
  nextRound,
  playHand,
  previewHand,
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

test("ships 20 jokers and balanced one-turn UNO modules", () => {
  assert.equal(JOKER_IDS.length, 20);
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

  shop = {
    ...shop,
    shop: {
      id: "test-pack-rack",
      rerollCost: 2,
      rerolls: 0,
      offers: [
        { id: "glitch-pack", kind: "card-pack", packKind: "glitch", price: 0 },
      ],
    },
  };
  const beforePackSize = shop.deck?.length ?? 0;
  shop = buyCardPack(shop, "glitch-pack");
  assert.equal(shop.packOpening?.choices.length, 3);
  const chosen = shop.packOpening?.choices[0];
  assert.ok(chosen?.enhancement);
  shop = choosePackCard(shop, chosen.id);
  assert.equal(shop.deck?.length, beforePackSize + 1);

  const next = nextRound(shop);
  assert.equal(next.deck?.length, beforePackSize + 1);
  assert.equal(next.deck?.find((item) => item.id === target.id)?.enhancement, "charged");
  assert.ok(next.deck?.some((item) => item.id === chosen.id));
});
