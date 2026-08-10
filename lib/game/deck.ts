import { CARD_COLORS } from "./constants";
import { shuffle } from "./rng";
import type { CardRank, GameCard } from "./types";

export function createNumberDeck(): readonly GameCard[] {
  const cards: GameCard[] = [];

  for (const color of CARD_COLORS) {
    for (let rank = 0; rank <= 9; rank += 1) {
      cards.push({
        id: `${color}-${rank}`,
        color,
        rank: rank as CardRank,
      });
    }
  }

  return cards;
}

export interface DrawResult {
  readonly drawn: readonly GameCard[];
  readonly drawPile: readonly GameCard[];
  readonly discardPile: readonly GameCard[];
  readonly rngState: number;
}

/**
 * Draws up to count cards. When needed, the discard pile is deterministically
 * shuffled back into the draw pile.
 */
export function drawCards(
  drawPileInput: readonly GameCard[],
  discardPileInput: readonly GameCard[],
  count: number,
  rngStateInput: number,
): DrawResult {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("draw count must be a non-negative integer");
  }

  let drawPile = [...drawPileInput];
  let discardPile = [...discardPileInput];
  let rngState = rngStateInput;
  const drawn: GameCard[] = [];

  while (drawn.length < count) {
    if (drawPile.length === 0) {
      if (discardPile.length === 0) break;
      const reshuffled = shuffle(discardPile, rngState);
      drawPile = [...reshuffled.values];
      discardPile = [];
      rngState = reshuffled.nextState;
    }

    const card = drawPile.pop();
    if (card) drawn.push(card);
  }

  return { drawn, drawPile, discardPile, rngState };
}

export function shuffledDeck(rngState: number): {
  readonly deck: readonly GameCard[];
  readonly rngState: number;
} {
  const result = shuffle(createNumberDeck(), rngState);
  return { deck: result.values, rngState: result.nextState };
}
