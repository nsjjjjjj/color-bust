import assert from "node:assert/strict";
import test from "node:test";
import { STARTING_HAND_SIZE } from "../lib/game/constants";
import {
  applyJokers,
  createRun,
  discardCards,
  nextRound,
  playHand,
  type GameCard,
  type RunState,
} from "../lib/game/index";

function card(id: string, rank: GameCard["rank"], color: GameCard["color"]): GameCard {
  return { id, rank, color };
}

const emptyHand = {
  type: "high-card" as const,
  selectedCardIds: [] as string[],
  scoringCardIds: [] as string[],
};

test("blueprint-protocol copies its right-hand neighbor's contribution", () => {
  const scoringCards = [card("red-1", 3, "red")];
  const jokers = [
    { instanceId: "j-blueprint", jokerId: "blueprint-protocol" as const, acquiredRound: 1 },
    { instanceId: "j-redline", jokerId: "redline" as const, acquiredRound: 1 },
  ];
  const result = applyJokers({
    jokers,
    selectedCards: scoringCards,
    scoringCards,
    hand: scoringCards,
    evaluatedHand: { type: "high-card", selectedCardIds: ["red-1"], scoringCardIds: ["red-1"] },
    handHistory: [],
    handsLeftBeforePlay: 4,
    discardsLeft: 2,
    emptyJokerSlots: 0,
    rngState: 12345,
  });

  assert.equal(result.jokerChipBonus, 24);
  assert.equal(result.appliedEffects.filter((effect) => effect.sourceId === "redline").length, 1);
  assert.equal(
    result.appliedEffects.filter((effect) => effect.sourceId === "blueprint-protocol").length,
    1,
  );
});

test("blueprint-protocol does nothing when its neighbor is also a blueprint", () => {
  const jokers = [
    { instanceId: "j1", jokerId: "blueprint-protocol" as const, acquiredRound: 1 },
    { instanceId: "j2", jokerId: "blueprint-protocol" as const, acquiredRound: 1 },
  ];
  const result = applyJokers({
    jokers,
    selectedCards: [],
    scoringCards: [],
    hand: [],
    evaluatedHand: emptyHand,
    handHistory: [],
    handsLeftBeforePlay: 4,
    discardsLeft: 2,
    emptyJokerSlots: 0,
    rngState: 1,
  });
  assert.equal(result.jokerChipBonus, 0);
  assert.equal(result.multiplierBonus, 0);
  assert.equal(result.xMultiplier, 1);
});

test("probability-trigger MODs consume rng deterministically", () => {
  const scoringCards = [card("eight", 8, "red")];
  const input = {
    jokers: [{ instanceId: "j-8ball", jokerId: "eight-ball-exploit" as const, acquiredRound: 1 }],
    selectedCards: scoringCards,
    scoringCards,
    hand: scoringCards,
    evaluatedHand: { type: "high-card" as const, selectedCardIds: ["eight"], scoringCardIds: ["eight"] },
    handHistory: [],
    handsLeftBeforePlay: 4,
    discardsLeft: 2,
    emptyJokerSlots: 0,
    rngState: 999,
  };
  const first = applyJokers(input);
  const second = applyJokers(input);
  assert.deepEqual(first, second);
  assert.notEqual(first.rngState, input.rngState);
});

test("stencil-core MAYHEM scales with empty MOD slots", () => {
  const jokers = [{ instanceId: "j-stencil", jokerId: "stencil-core" as const, acquiredRound: 1 }];
  const base = {
    jokers,
    selectedCards: [],
    scoringCards: [],
    hand: [],
    evaluatedHand: emptyHand,
    handHistory: [],
    handsLeftBeforePlay: 4,
    discardsLeft: 2,
    rngState: 1,
  };
  const withThreeEmpty = applyJokers({ ...base, emptyJokerSlots: 3 });
  const withNoneEmpty = applyJokers({ ...base, emptyJokerSlots: 0 });
  assert.equal(withThreeEmpty.xMultiplier, 1.9);
  assert.equal(withNoneEmpty.xMultiplier, 1);
});

test("runner-process pays out its accumulated bonus, then grows further", () => {
  const straightCards = [1, 2, 3, 4, 5].map((rank, index) =>
    card(`s${index}`, rank as GameCard["rank"], "red"),
  );
  const evaluatedHand = {
    type: "straight" as const,
    selectedCardIds: straightCards.map((c) => c.id),
    scoringCardIds: straightCards.map((c) => c.id),
  };
  const base = {
    selectedCards: straightCards,
    scoringCards: straightCards,
    hand: straightCards,
    evaluatedHand,
    handHistory: [],
    handsLeftBeforePlay: 4,
    discardsLeft: 2,
    emptyJokerSlots: 0,
    rngState: 1,
  };

  const first = applyJokers({
    ...base,
    jokers: [{ instanceId: "j-runner", jokerId: "runner-process" as const, acquiredRound: 1, counter: 0 }],
  });
  assert.equal(first.jokerChipBonus, 0);
  assert.equal(first.updatedJokers[0].counter, 15);

  const second = applyJokers({ ...base, jokers: first.updatedJokers });
  assert.equal(second.jokerChipBonus, 15);
  assert.equal(second.updatedJokers[0].counter, 30);
});

test("green-demon loses accumulated HYPE per discard action", () => {
  const initial = createRun({ seed: "green-demon" });
  const state: RunState = {
    ...initial,
    jokers: [{ instanceId: "j-green", jokerId: "green-demon", acquiredRound: 1, counter: 3 }],
  };
  const next = discardCards(state, [state.hand[0].id]);
  assert.equal(next.jokers[0].counter, 2);
});

test("ice-cream-cache decays per hand and resets at the start of the next round", () => {
  const initial = createRun({ seed: "ice-cream" });
  const state: RunState = {
    ...initial,
    handsLeft: 4,
    jokers: [{ instanceId: "j-ice", jokerId: "ice-cream-cache", acquiredRound: 1, counter: 48 }],
  };
  const played = playHand(state, [state.hand[0].id]);
  assert.equal(played.state.jokers[0].counter, 36);

  const shopState: RunState = { ...played.state, phase: "shop" };
  const resetState = nextRound(shopState);
  assert.equal(resetState.jokers[0].counter, 48);
});

test("turtle-bean-cache grants extra hand size that decays each round", () => {
  const initial = createRun({ seed: "turtle-bean" });
  const shopState: RunState = {
    ...initial,
    phase: "shop",
    jokers: [{ instanceId: "j-turtle", jokerId: "turtle-bean-cache", acquiredRound: 1, counter: 5 }],
  };
  const next = nextRound(shopState);
  assert.equal(next.hand.length, STARTING_HAND_SIZE + 2);
  assert.equal(next.jokers[0].counter, 4);

  const shopStateExpired: RunState = {
    ...next,
    phase: "shop",
    jokers: [{ instanceId: "j-turtle", jokerId: "turtle-bean-cache", acquiredRound: 1, counter: 0 }],
  };
  const afterExpiry = nextRound(shopStateExpired);
  assert.equal(afterExpiry.hand.length, STARTING_HAND_SIZE);
});

test("delayed-gratification pays a round-clear bonus only when no discards were used", () => {
  const initial = createRun({ seed: "delayed-grat" });
  const withJoker: RunState = {
    ...initial,
    target: 1,
    jokers: [{ instanceId: "j-dg", jokerId: "delayed-gratification", acquiredRound: 1 }],
  };
  const withoutJoker: RunState = { ...initial, target: 1, jokers: [] };

  const resultWith = playHand(withJoker, [withJoker.hand[0].id]);
  const resultWithout = playHand(withoutJoker, [withoutJoker.hand[0].id]);

  assert.equal(resultWith.roundCleared, true);
  assert.ok(resultWith.state.pendingReward);
  assert.ok(resultWithout.state.pendingReward);
  assert.equal(
    resultWith.state.pendingReward!.total,
    resultWithout.state.pendingReward!.total + 6,
  );
});

test("delayed-gratification withholds its bonus once a discard has been used", () => {
  const initial = createRun({ seed: "delayed-grat-used" });
  let state: RunState = {
    ...initial,
    target: 1,
    jokers: [{ instanceId: "j-dg", jokerId: "delayed-gratification", acquiredRound: 1 }],
  };
  state = discardCards(state, [state.hand[0].id]);
  const withoutBonus: RunState = { ...state, jokers: [] };

  const resultWith = playHand(state, [state.hand[0].id]);
  const resultWithout = playHand(withoutBonus, [withoutBonus.hand[0].id]);

  assert.equal(
    resultWith.state.pendingReward!.total,
    resultWithout.state.pendingReward!.total,
  );
});

test("cavendish-overclock either survives or is cleanly removed at round clear", () => {
  for (let seedIndex = 0; seedIndex < 8; seedIndex += 1) {
    const initial = createRun({ seed: `cavendish-${seedIndex}` });
    const state: RunState = {
      ...initial,
      target: 1,
      jokers: [
        { instanceId: "j-other", jokerId: "zero-day", acquiredRound: 1 },
        { instanceId: "j-cav", jokerId: "cavendish-overclock", acquiredRound: 1 },
      ],
    };
    const result = playHand(state, [state.hand[0].id]);
    const survivorIds = result.state.jokers.map((joker) => joker.instanceId);
    assert.ok(survivorIds.includes("j-other"));
    assert.ok(survivorIds.length === 1 || survivorIds.length === 2);
    if (survivorIds.length === 2) assert.ok(survivorIds.includes("j-cav"));
  }
});

test("perkeos-echo either leaves the stash unchanged or duplicates a ghost item within the slot limit", () => {
  for (let seedIndex = 0; seedIndex < 8; seedIndex += 1) {
    const initial = createRun({ seed: `perkeo-${seedIndex}` });
    const state: RunState = {
      ...initial,
      target: 1,
      jokers: [{ instanceId: "j-perkeo", jokerId: "perkeos-echo", acquiredRound: 1 }],
      communityUno: [
        { id: "ghost-1", kind: "ghost", ghostId: "wild-signal", name: "와일드 시그널", price: 7 },
      ],
    };
    const result = playHand(state, [state.hand[0].id]);
    const count = result.state.communityUno.length;
    assert.ok(count === 1 || count === 2);
    if (count === 2) {
      assert.ok(
        result.state.communityUno.every(
          (item) => "kind" in item && item.kind === "ghost" && item.ghostId === "wild-signal",
        ),
      );
    }
  }
});
