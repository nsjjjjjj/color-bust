import assert from "node:assert/strict";
import test from "node:test";
import { recommendBestHand } from "../lib/game/advisor";
import {
  DEFAULT_COMMUNITY_UNO_CARDS,
  createRun,
  type GameCard,
  type RunState,
} from "../lib/game/index";

function card(
  id: string,
  rank: GameCard["rank"],
  color: GameCard["color"],
): GameCard {
  return { id, rank, color };
}

function withHand(run: RunState, hand: readonly GameCard[]): RunState {
  return { ...run, hand };
}

test("exhaustively recommends the highest-scoring 1-5 card combination", () => {
  const run = withHand(createRun({ seed: "advisor-straight-flush" }), [
    card("r0", 0, "red"),
    card("r1", 1, "red"),
    card("r2", 2, "red"),
    card("r3", 3, "red"),
    card("r4", 4, "red"),
    card("b9", 9, "blue"),
    card("g9", 9, "green"),
    card("y7", 7, "yellow"),
  ]);

  const recommendation = recommendBestHand(run);

  assert.equal(recommendation.evaluatedCombinations, 218);
  assert.equal(recommendation.breakdown.handType, "straight-flush");
  assert.deepEqual(recommendation.cardIds, ["r0", "r1", "r2", "r3", "r4"]);
});

test("uses hand rank before card count when scores tie", () => {
  const original = createRun({ seed: "advisor-hand-rank-tie" });
  const run = withHand(
    {
      ...original,
      handLevels: { ...original.handLevels, "high-card": 2 },
    },
    [card("red-four", 4, "red"), card("blue-four", 4, "blue")],
  );

  const recommendation = recommendBestHand(run);

  // Level 2 High Card 4 and Level 1 Pair 4 both score 40.
  assert.equal(recommendation.breakdown.total, 40);
  assert.equal(recommendation.breakdown.handType, "pair");
  assert.deepEqual(recommendation.cardIds, ["red-four", "blue-four"]);
});

test("prefers fewer cards and then the original hand order", () => {
  const run = withHand(createRun({ seed: "advisor-stable-tie" }), [
    card("first-zero", 0, "green"),
    card("second-nine", 9, "red"),
    card("extra-seven", 7, "blue"),
  ]);

  const first = recommendBestHand(run);
  const second = recommendBestHand(run);

  // A single 0 and a single 9 both score 15. Earlier hand position wins.
  assert.deepEqual(first.cardIds, ["first-zero"]);
  assert.deepEqual(second, first);
});

test("supports UNO previews without mutating or consuming the run", () => {
  const uno = DEFAULT_COMMUNITY_UNO_CARDS[0];
  const original = withHand(
    createRun({ seed: "advisor-uno", starterUno: uno }),
    [
      card("red-nine", 9, "red"),
      card("blue-seven", 7, "blue"),
      card("green-four", 4, "green"),
    ],
  );
  const before = JSON.stringify(original);

  const recommendation = recommendBestHand(original, {
    unoCardId: uno.id,
    calledColor: "red",
  });

  assert.equal(recommendation.breakdown.uno?.cardId, uno.id);
  assert.equal(original.unoUsedThisAnte, false);
  assert.equal(JSON.stringify(original), before);
});

test("rejects an empty current hand with a game rule error", () => {
  const run = withHand(createRun({ seed: "advisor-empty" }), []);

  assert.throws(
    () => recommendBestHand(run),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "GameRuleError" &&
      "code" in error &&
      error.code === "EMPTY_HAND",
  );
});
