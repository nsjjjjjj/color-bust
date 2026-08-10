import assert from "node:assert/strict";
import test from "node:test";

import type { CardColor, CardRank, GameCard } from "../lib/game/types";
import {
  comparePileToReference,
  summarizePile,
} from "../app/components/pile-inspector";

function card(id: string, color: CardColor, rank: CardRank): GameCard {
  return { id, color, rank };
}

test("compares the draw pile with the real run deck in a fixed 40-slot matrix", () => {
  const redZeros = [
    card("red-0-a", "red", 0),
    card("red-0-b", "red", 0),
    card("red-0-c", "red", 0),
  ];
  const blueNine = card("blue-9", "blue", 9);
  const greenFive = card("green-5", "green", 5);
  const reference = [...redZeros, blueNine, greenFive];
  const current = [redZeros[0], blueNine];

  const comparison = comparePileToReference(current, reference);

  assert.equal(comparison.slots.length, 40);
  assert.equal(comparison.groups.length, 4);
  assert.ok(comparison.groups.every((group) => group.cards.length === 10));
  assert.equal(comparison.current, 2);
  assert.equal(comparison.total, 5);
  assert.equal(comparison.missing, 3);

  const redZero = comparison.slots.find(
    (slot) => slot.color === "red" && slot.rank === 0,
  );
  assert.deepEqual(redZero, {
    color: "red",
    rank: 0,
    current: 1,
    total: 3,
    missing: 2,
    availability: "partial",
  });

  const greenFiveSlot = comparison.slots.find(
    (slot) => slot.color === "green" && slot.rank === 5,
  );
  assert.equal(greenFiveSlot?.availability, "depleted");
  assert.equal(greenFiveSlot?.current, 0);
  assert.equal(greenFiveSlot?.total, 1);

  const yellowZero = comparison.slots.find(
    (slot) => slot.color === "yellow" && slot.rank === 0,
  );
  assert.equal(yellowZero?.availability, "absent");
  assert.equal(yellowZero?.total, 0);
});

test("summarizes colors in UI order and supports duplicate current/total counts", () => {
  const reference = [
    card("red-2-a", "red", 2),
    card("red-2-b", "red", 2),
    card("yellow-4", "yellow", 4),
    card("green-6", "green", 6),
    card("blue-8", "blue", 8),
  ];
  const current = [reference[0], reference[1], reference[3]];

  const comparison = comparePileToReference(current, reference);

  assert.deepEqual(
    comparison.colors.map(({ color, current: remaining, total }) => ({ color, remaining, total })),
    [
      { color: "red", remaining: 2, total: 2 },
      { color: "yellow", remaining: 0, total: 1 },
      { color: "green", remaining: 1, total: 1 },
      { color: "blue", remaining: 0, total: 1 },
    ],
  );
  assert.equal(
    comparison.slots.find((slot) => slot.color === "red" && slot.rank === 2)?.availability,
    "available",
  );
});

test("never reports a stale reference total below the live pile", () => {
  const current = [
    card("blue-1-a", "blue", 1),
    card("blue-1-b", "blue", 1),
  ];
  const staleReference = [current[0]];

  const comparison = comparePileToReference(current, staleReference);
  const blueOne = comparison.slots.find(
    (slot) => slot.color === "blue" && slot.rank === 1,
  );

  assert.equal(comparison.current, 2);
  assert.equal(comparison.total, 2);
  assert.equal(blueOne?.current, 2);
  assert.equal(blueOne?.total, 2);
  assert.equal(blueOne?.availability, "available");
});

test("keeps the discard top-card summary in engine order", () => {
  const cards = [
    card("red-1", "red", 1),
    card("green-7", "green", 7),
  ];

  const summary = summarizePile(cards);
  assert.equal(summary.total, 2);
  assert.equal(summary.byColor.red, 1);
  assert.equal(summary.byColor.green, 1);
  assert.equal(summary.topCard?.id, "green-7");
});
