import type { EvaluatedHand, GameCard, HandType } from "./types";

function cardsWithRanks(
  cards: readonly GameCard[],
  ranks: ReadonlySet<number>,
): readonly GameCard[] {
  return cards.filter((card) => ranks.has(card.rank));
}

export function isStraight(cards: readonly GameCard[]): boolean {
  if (cards.length !== 5) return false;
  const ranks = [...new Set(cards.map((card) => card.rank))].sort(
    (left, right) => left - right,
  );
  if (ranks.length !== 5) return false;

  // Only 0-4 through 5-9 are valid; 8-9-0-1-2 style wrapping is forbidden.
  return ranks[4] - ranks[0] === 4;
}

export function isFlush(cards: readonly GameCard[]): boolean {
  return (
    cards.length === 5 &&
    cards.every((card) => card.color === cards[0]?.color)
  );
}

export function evaluateHand(cards: readonly GameCard[]): EvaluatedHand {
  if (cards.length < 1 || cards.length > 5) {
    throw new RangeError("A hand must contain between 1 and 5 cards");
  }

  const ids = new Set(cards.map((card) => card.id));
  if (ids.size !== cards.length) {
    throw new Error("A hand cannot contain the same card twice");
  }

  const byRank = new Map<number, GameCard[]>();
  for (const card of cards) {
    const group = byRank.get(card.rank) ?? [];
    group.push(card);
    byRank.set(card.rank, group);
  }

  const groups = [...byRank.entries()].sort((left, right) => {
    const countDifference = right[1].length - left[1].length;
    return countDifference || right[0] - left[0];
  });
  const straight = isStraight(cards);
  const flush = isFlush(cards);

  let type: HandType;
  let scoringCards: readonly GameCard[];

  if (straight && flush) {
    type = "straight-flush";
    scoringCards = cards;
  } else {
    const four = groups.find(([, group]) => group.length === 4);
    const triple = groups.find(([, group]) => group.length === 3);
    const pairs = groups
      .filter(([, group]) => group.length === 2)
      .sort((left, right) => right[0] - left[0]);

    if (four) {
      type = "four-of-a-kind";
      scoringCards = four[1];
    } else if (triple && pairs.length >= 1 && cards.length === 5) {
      type = "full-house";
      scoringCards = cardsWithRanks(
        cards,
        new Set([triple[0], pairs[0][0]]),
      );
    } else if (flush) {
      type = "flush";
      scoringCards = cards;
    } else if (straight) {
      type = "straight";
      scoringCards = cards;
    } else if (triple) {
      type = "three-of-a-kind";
      scoringCards = triple[1];
    } else if (pairs.length >= 2) {
      type = "two-pair";
      scoringCards = cardsWithRanks(
        cards,
        new Set([pairs[0][0], pairs[1][0]]),
      );
    } else if (pairs.length === 1) {
      type = "pair";
      scoringCards = pairs[0][1];
    } else {
      type = "high-card";
      const highestRank = Math.max(...cards.map((card) => card.rank));
      scoringCards = [cards.find((card) => card.rank === highestRank)!];
    }
  }

  return {
    type,
    selectedCardIds: cards.map((card) => card.id),
    scoringCardIds: scoringCards.map((card) => card.id),
  };
}

export function isFlushType(type: HandType): boolean {
  return type === "flush" || type === "straight-flush";
}

export function isStraightType(type: HandType): boolean {
  return type === "straight" || type === "straight-flush";
}
