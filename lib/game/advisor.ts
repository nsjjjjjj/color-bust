import { previewHand } from "./engine";
import {
  HAND_TYPES,
  GameRuleError,
  type GameCard,
  type HandType,
  type PlayHandOptions,
  type RunState,
  type ScoreBreakdown,
} from "./types";

const HAND_RANK = new Map<HandType, number>(
  HAND_TYPES.map((handType, index) => [handType, index]),
);

export interface BestHandRecommendation {
  /** IDs are always returned in their original RunState.hand order. */
  readonly cardIds: readonly string[];
  readonly cards: readonly GameCard[];
  readonly breakdown: ScoreBreakdown;
  readonly evaluatedCombinations: number;
}

interface Candidate {
  readonly cards: readonly GameCard[];
  readonly handIndexes: readonly number[];
  readonly breakdown: ScoreBreakdown;
}

function compareOriginalOrder(
  left: readonly number[],
  right: readonly number[],
): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

/** Returns true when candidate should replace currentBest. */
function isBetter(candidate: Candidate, currentBest: Candidate): boolean {
  if (candidate.breakdown.total !== currentBest.breakdown.total) {
    return candidate.breakdown.total > currentBest.breakdown.total;
  }

  const candidateRank = HAND_RANK.get(candidate.breakdown.handType) ?? -1;
  const currentRank = HAND_RANK.get(currentBest.breakdown.handType) ?? -1;
  if (candidateRank !== currentRank) return candidateRank > currentRank;

  if (candidate.cards.length !== currentBest.cards.length) {
    return candidate.cards.length < currentBest.cards.length;
  }

  return compareOriginalOrder(candidate.handIndexes, currentBest.handIndexes) < 0;
}

/**
 * Exhaustively previews every 1-5 card combination in the current hand.
 *
 * The function never mutates RunState or consumes RNG/UNO. Ties are resolved by
 * total score, higher poker hand, fewer selected cards, then lexicographically
 * earlier positions in the original hand.
 */
export function recommendBestHand(
  run: RunState,
  options: PlayHandOptions = {},
): BestHandRecommendation {
  const maximumCards = Math.min(5, run.hand.length);
  if (maximumCards === 0) {
    throw new GameRuleError(
      "EMPTY_HAND",
      "추천할 수 있는 카드가 현재 손패에 없습니다.",
    );
  }

  let best: Candidate | undefined;
  let evaluatedCombinations = 0;
  const selectedIndexes: number[] = [];

  const evaluateSelection = (): void => {
    const cards = selectedIndexes.map((index) => run.hand[index]);
    const cardIds = cards.map((card) => card.id);
    const candidate: Candidate = {
      cards,
      handIndexes: [...selectedIndexes],
      breakdown: previewHand(run, cardIds, options),
    };
    evaluatedCombinations += 1;

    if (!best || isBetter(candidate, best)) best = candidate;
  };

  const visit = (startIndex: number): void => {
    if (selectedIndexes.length > 0) evaluateSelection();
    if (selectedIndexes.length === maximumCards) return;

    for (let index = startIndex; index < run.hand.length; index += 1) {
      selectedIndexes.push(index);
      visit(index + 1);
      selectedIndexes.pop();
    }
  };

  visit(0);

  // maximumCards > 0 guarantees at least one evaluated combination.
  const recommendation = best!;
  return {
    cardIds: recommendation.cards.map((card) => card.id),
    cards: recommendation.cards,
    breakdown: recommendation.breakdown,
    evaluatedCombinations,
  };
}
