import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_COMMUNITY_UNO_CARDS } from "../lib/game/constants";
import { createRun } from "../lib/game/engine";
import { buildScoreEvents } from "../lib/game/score-events";
import { calculateHandScore } from "../lib/game/scoring";
import type { GameCard, RunState, ScoreBreakdown } from "../lib/game/types";

function card(
  id: string,
  rank: GameCard["rank"],
  color: GameCard["color"],
): GameCard {
  return { id, rank, color };
}

test("builds hand, base, scoring-card, and final events in play order", () => {
  const selectedCards = [
    card("pair-red", 4, "red"),
    card("pair-blue", 4, "blue"),
    card("kicker", 9, "green"),
  ];
  const breakdown: ScoreBreakdown = {
    handType: "pair",
    handName: "페어",
    handLevel: 1,
    selectedCardIds: selectedCards.map(({ id }) => id),
    scoringCardIds: ["pair-red", "pair-blue"],
    baseChips: 10,
    numericChips: 10,
    jokerChipBonus: 0,
    baseMultiplier: 2,
    jokerMultiplierBonus: 0,
    jokerXMultiplier: 1,
    chipsBeforeUno: 20,
    multiplierBeforeUno: 2,
    scoreBeforeUno: 40,
    total: 40,
    coinGain: 0,
    roundReward: 0,
    appliedJokers: [],
  };

  const before = JSON.stringify({ breakdown, selectedCards });
  const events = buildScoreEvents(breakdown, selectedCards);

  assert.equal(events[0].type, "hand-detected");
  assert.deepEqual(
    [events[0].currentChips, events[0].currentMultiplier, events[0].currentXMultiplier],
    [0, 0, 1],
  );
  assert.equal(events[1].type, "base-score");
  assert.deepEqual(
    [events[1].currentChips, events[1].currentMultiplier, events[1].currentXMultiplier],
    [breakdown.baseChips, breakdown.baseMultiplier, 1],
  );
  assert.deepEqual(
    events.filter(({ type }) => type === "card-score").map(({ sourceCardId }) => sourceCardId),
    ["pair-red", "pair-blue"],
  );
  assert.equal(events.at(-1)?.type, "final-score");
  assert.equal(events.at(-1)?.currentTotal, breakdown.total);
  assert.equal(events.at(-1)?.currentChips, breakdown.chipsBeforeUno);
  assert.equal(events.at(-1)?.currentMultiplier, breakdown.multiplierBeforeUno);
  assert.equal(events.at(-1)?.total, breakdown.total);
  assert.equal(JSON.stringify({ breakdown, selectedCards }), before);
});

test("plays joker effects before UNO effects and preserves the engine total", () => {
  const selectedCards = [0, 1, 2, 3, 4].map((rank) =>
    card(`red-${rank}`, rank as GameCard["rank"], "red"),
  );
  const uno = DEFAULT_COMMUNITY_UNO_CARDS.find(
    ({ id }) => id === "community-low-pulse",
  );
  assert.ok(uno);

  const initial = createRun({ seed: "score-event-order" });
  const state: RunState = {
    ...initial,
    handsLeft: 1,
    jokers: [
      { instanceId: "joker-redline", jokerId: "redline", acquiredRound: 1 },
      { instanceId: "joker-zero", jokerId: "zero-day", acquiredRound: 1 },
    ],
    communityUno: [uno],
  };
  const { breakdown } = calculateHandScore(state, selectedCards, {
    unoCardId: uno.id,
    calledColor: "red",
  });
  const events = buildScoreEvents(breakdown, selectedCards);
  const eventTypes = events.map(({ type }) => type);
  const lastCardIndex = eventTypes.lastIndexOf("card-score");
  const firstJokerIndex = eventTypes.indexOf("joker-effect");
  const firstUnoIndex = eventTypes.indexOf("uno-effect");
  const unoResultIndex = eventTypes.indexOf("uno-result");
  const finalIndex = eventTypes.indexOf("final-score");

  assert.ok(lastCardIndex > eventTypes.indexOf("base-score"));
  assert.ok(firstJokerIndex > lastCardIndex);
  assert.ok(firstUnoIndex > firstJokerIndex);
  assert.ok(unoResultIndex > firstUnoIndex);
  assert.ok(finalIndex > unoResultIndex);
  assert.equal(events[unoResultIndex].currentTotal, breakdown.uno?.scoreAfterUno);
  assert.equal(events[finalIndex].currentTotal, breakdown.total);
  assert.equal(events[finalIndex].total, breakdown.total);
  assert.equal(new Set(events.map(({ id }) => id)).size, events.length);
  assert.ok(events.every(({ currentTotal }) => Number.isInteger(currentTotal)));
});

test("adds aggregate adjustments when granular effects do not expose full totals", () => {
  const selectedCards = [card("high", 7, "yellow")];
  const breakdown: ScoreBreakdown = {
    handType: "high-card",
    handName: "하이 카드",
    handLevel: 1,
    selectedCardIds: ["high"],
    scoringCardIds: ["high"],
    baseChips: 5,
    numericChips: 10,
    jokerChipBonus: 4,
    baseMultiplier: 1,
    jokerMultiplierBonus: 2,
    jokerXMultiplier: 1.5,
    chipsBeforeUno: 19,
    multiplierBeforeUno: 3,
    scoreBeforeUno: 85,
    total: 85,
    coinGain: 0,
    roundReward: 0,
    appliedJokers: [
      {
        sourceId: "partial-effect",
        sourceName: "부분 공개 효과",
        description: "세부 정보에는 일부 값만 노출",
        chips: 2,
        multiplier: 1,
      },
    ],
  };

  const events = buildScoreEvents(breakdown, selectedCards);
  const adjustments = events.filter(
    ({ type }) => type === "aggregate-adjustment",
  );

  assert.ok(adjustments.some(({ sourceEffectId }) => sourceEffectId === "pre-uno-chip-total"));
  assert.ok(
    adjustments.some(
      ({ sourceEffectId }) => sourceEffectId === "pre-uno-multiplier-total",
    ),
  );
  assert.ok(adjustments.some(({ sourceEffectId }) => sourceEffectId === "pre-uno-x-total"));
  assert.equal(events.at(-1)?.currentTotal, breakdown.total);
  assert.equal(events.at(-1)?.total, breakdown.total);
});
