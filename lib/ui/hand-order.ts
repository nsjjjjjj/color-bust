import type { CardColor, GameCard } from "../game/types";

export type HandSort = "rank" | "color";

const COLOR_ORDER: Readonly<Record<CardColor, number>> = {
  red: 0,
  blue: 1,
  green: 2,
  yellow: 3,
};

/**
 * Keeps cards that are still in the hand in their current presentation order,
 * then appends newly drawn cards in deal order.
 */
export function reconcileHandOrder(
  currentOrder: readonly string[],
  hand: readonly GameCard[],
): readonly string[] {
  const availableIds = new Set(hand.map((card) => card.id));
  const nextOrder = currentOrder.filter((id) => availableIds.has(id));
  const orderedIds = new Set(nextOrder);

  for (const card of hand) {
    if (orderedIds.has(card.id)) continue;
    nextOrder.push(card.id);
    orderedIds.add(card.id);
  }

  return nextOrder;
}

export function orderHand(
  hand: readonly GameCard[],
  currentOrder: readonly string[],
): GameCard[] {
  const byId = new Map(hand.map((card) => [card.id, card]));
  return reconcileHandOrder(currentOrder, hand)
    .map((id) => byId.get(id))
    .filter((card): card is GameCard => Boolean(card));
}

/** Sorts the cards once. It does not create a persistent sort mode. */
export function sortHandOnce(
  hand: readonly GameCard[],
  currentOrder: readonly string[],
  sort: HandSort,
): readonly string[] {
  return orderHand(hand, currentOrder)
    .sort((left, right) => {
      if (sort === "rank") {
        return left.rank - right.rank || COLOR_ORDER[left.color] - COLOR_ORDER[right.color];
      }
      return COLOR_ORDER[left.color] - COLOR_ORDER[right.color] || left.rank - right.rank;
    })
    .map((card) => card.id);
}
