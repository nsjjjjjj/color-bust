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
 * Draws up to count cards. Discarded and played cards stay out for the entire
 * round; the full persistent run deck is shuffled only when the next round
 * starts.
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

  const drawPile = [...drawPileInput];
  const discardPile = [...discardPileInput];
  const rngState = rngStateInput;
  const drawn: GameCard[] = [];

  while (drawn.length < count) {
    if (drawPile.length === 0) break;

    const card = drawPile.pop();
    if (card) drawn.push(card);
  }

  return { drawn, drawPile, discardPile, rngState };
}

export function shuffledDeck(rngState: number): {
  readonly deck: readonly GameCard[];
  readonly rngState: number;
} {
  // Kept as the default-deck constructor for fresh runs.
  const result = shuffle(createNumberDeck(), rngState);
  return { deck: result.values, rngState: result.nextState };
}
