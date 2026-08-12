import assert from "node:assert/strict";
import test from "node:test";

import type { GameCard } from "../lib/game/types";
import { orderHand, orderHandWithSort, reconcileHandOrder, sortHandOnce } from "../lib/ui/hand-order";

const cards = [
  { id: "blue-7", color: "blue", rank: 7 },
  { id: "red-2", color: "red", rank: 2 },
  { id: "green-4", color: "green", rank: 4 },
  { id: "yellow-1", color: "yellow", rank: 1 },
] satisfies readonly GameCard[];

test("fresh hands preserve their shuffled deal order", () => {
  assert.deepEqual(orderHand(cards, []).map((card) => card.id), cards.map((card) => card.id));
});

test("sorting is a one-shot command", () => {
  const rankOrder = sortHandOnce(cards, [], "rank");
  assert.deepEqual(rankOrder, ["yellow-1", "red-2", "green-4", "blue-7"]);
  assert.deepEqual(orderHand(cards, rankOrder).map((card) => card.id), rankOrder);
});

test("replacement cards append on the right after a one-shot sort", () => {
  const rankOrder = sortHandOnce(cards, [], "rank");
  const replacement = { id: "red-9", color: "red", rank: 9 } satisfies GameCard;
  const nextHand = [cards[0], cards[2], cards[3], replacement];
  const nextOrder = reconcileHandOrder(rankOrder, nextHand);

  assert.deepEqual(nextOrder, ["yellow-1", "green-4", "blue-7", "red-9"]);
});

test("replacement cards follow the most recently chosen persistent sort", () => {
  const rankOrder = sortHandOnce(cards, [], "rank");
  const replacement = { id: "red-9", color: "red", rank: 9 } satisfies GameCard;
  const nextHand = [cards[0], cards[2], cards[3], replacement];

  assert.deepEqual(
    orderHandWithSort(nextHand, rankOrder, "rank").map((card) => card.id),
    ["yellow-1", "green-4", "blue-7", "red-9"],
  );
  assert.deepEqual(
    orderHandWithSort(nextHand, rankOrder, "color").map((card) => card.id),
    ["red-9", "blue-7", "green-4", "yellow-1"],
  );
});

test("a later color-sort applies to the whole current hand only when pressed", () => {
  const current = ["yellow-1", "green-4", "blue-7", "red-9"];
  const hand = [
    cards[0],
    cards[2],
    cards[3],
    { id: "red-9", color: "red", rank: 9 },
  ] satisfies readonly GameCard[];

  assert.deepEqual(sortHandOnce(hand, current, "color"), [
    "red-9",
    "blue-7",
    "green-4",
    "yellow-1",
  ]);
});
