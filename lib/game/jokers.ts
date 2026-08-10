import { JOKER_CATALOG, rankChipValue } from "./constants";
import { isFlushType, isStraightType } from "./hands";
import type {
  AppliedEffect,
  EvaluatedHand,
  GameCard,
  HandType,
  JokerInstance,
} from "./types";

export interface ApplyJokersInput {
  readonly jokers: readonly JokerInstance[];
  readonly selectedCards: readonly GameCard[];
  readonly scoringCards: readonly GameCard[];
  readonly evaluatedHand: EvaluatedHand;
  readonly handHistory: readonly HandType[];
  readonly handsLeftBeforePlay: number;
  readonly discardsLeft: number;
}

export interface JokerScoreResult {
  readonly numericChips: number;
  readonly jokerChipBonus: number;
  readonly multiplierBonus: number;
  readonly xMultiplier: number;
  readonly coinGain: number;
  readonly appliedEffects: readonly AppliedEffect[];
  readonly updatedJokers: readonly JokerInstance[];
}

function applied(
  joker: JokerInstance,
  description: string,
  values: Partial<
    Pick<AppliedEffect, "chips" | "multiplier" | "xMultiplier" | "coins">
  >,
): AppliedEffect {
  return {
    sourceId: joker.jokerId,
    sourceName: JOKER_CATALOG[joker.jokerId].name,
    description,
    ...values,
  };
}

function sumNumericChips(cards: readonly GameCard[]): number {
  return cards.reduce((total, card) => total + rankChipValue(card.rank), 0);
}

export function applyJokers(input: ApplyJokersInput): JokerScoreResult {
  const splashActive = input.jokers.some(
    (joker) => joker.jokerId === "splash-mode",
  );
  const numericCards = splashActive ? input.selectedCards : input.scoringCards;
  const normalNumericChips = sumNumericChips(input.scoringCards);
  const numericChips = sumNumericChips(numericCards);
  const appliedEffects: AppliedEffect[] = [];

  if (splashActive && numericChips > normalNumericChips) {
    const joker = input.jokers.find(
      (candidate) => candidate.jokerId === "splash-mode",
    )!;
    appliedEffects.push(
      applied(joker, "비득점 제출 카드도 숫자 칩 계산", {
        chips: numericChips - normalNumericChips,
      }),
    );
  }

  const scoringColors = new Set(input.scoringCards.map((card) => card.color));
  const scoringRankCounts = new Map<number, number>();
  for (const card of input.scoringCards) {
    scoringRankCounts.set(card.rank, (scoringRankCounts.get(card.rank) ?? 0) + 1);
  }

  const previousHand = input.handHistory.at(-1);
  let jokerChipBonus = 0;
  let multiplierBonus = 0;
  let xMultiplier = 1;
  let coinGain = 0;

  const updatedJokers = input.jokers.map((joker): JokerInstance => {
    switch (joker.jokerId) {
      case "zero-day":
        if (input.scoringCards.some((card) => card.rank === 0)) {
          multiplierBonus += 1;
          appliedEffects.push(applied(joker, "0 득점", { multiplier: 1 }));
        }
        break;
      case "redline": {
        const chips = Math.min(
          15,
          input.scoringCards.filter((card) => card.color === "red").length * 3,
        );
        jokerChipBonus += chips;
        if (chips) appliedEffects.push(applied(joker, "빨강 카드 증폭", { chips }));
        break;
      }
      case "blue-buffer":
        if (
          input.scoringCards.filter((card) => card.color === "blue").length >= 2
        ) {
          jokerChipBonus += 10;
          appliedEffects.push(applied(joker, "파랑 카드 2장 이상", { chips: 10 }));
        }
        break;
      case "green-loop":
        if (
          input.scoringCards.some(
            (card) => (scoringRankCounts.get(card.rank) ?? 0) >= 2,
          )
        ) {
          jokerChipBonus += 8;
          appliedEffects.push(applied(joker, "같은 숫자가 2장 이상 득점", { chips: 8 }));
        }
        break;
      case "yellow-ticket":
        if (
          input.handHistory.length === 0 &&
          input.scoringCards.some((card) => card.color === "yellow")
        ) {
          coinGain += 1;
          appliedEffects.push(applied(joker, "라운드 첫 핸드의 노랑 득점", { coins: 1 }));
        }
        break;
      case "odd-signal": {
        const chips = Math.min(
          10,
          input.scoringCards.filter((card) => card.rank % 2 === 1).length * 2,
        );
        jokerChipBonus += chips;
        if (chips) appliedEffects.push(applied(joker, "홀수 신호", { chips }));
        break;
      }
      case "even-signal": {
        const chips = Math.min(
          10,
          input.scoringCards.filter((card) => card.rank % 2 === 0).length * 2,
        );
        jokerChipBonus += chips;
        if (chips) appliedEffects.push(applied(joker, "짝수 신호", { chips }));
        break;
      }
      case "cache-hit":
        if (input.handHistory.includes(input.evaluatedHand.type)) {
          multiplierBonus += 1;
          appliedEffects.push(applied(joker, "이미 사용한 족보", { multiplier: 1 }));
        }
        break;
      case "splash-mode":
        break;
      case "spectrum-analyzer":
        if (scoringColors.size === 4) {
          jokerChipBonus += 10;
          multiplierBonus += 1;
          appliedEffects.push(
            applied(joker, "4색 스펙트럼 완성", { chips: 10, multiplier: 1 }),
          );
        }
        break;
      case "monochrome-monitor":
        if (isFlushType(input.evaluatedHand.type)) {
          jokerChipBonus += 10;
          multiplierBonus += 1;
          appliedEffects.push(
            applied(joker, "플러시 감지", { chips: 10, multiplier: 1 }),
          );
        }
        break;
      case "sequence-accelerator":
        if (isStraightType(input.evaluatedHand.type)) {
          multiplierBonus += 1;
          appliedEffects.push(applied(joker, "스트레이트 가속", { multiplier: 1 }));
        }
        break;
      case "full-stack":
        if (input.evaluatedHand.type === "full-house") {
          jokerChipBonus += 20;
          appliedEffects.push(applied(joker, "풀 스택 완성", { chips: 20 }));
        }
        break;
      case "spare-battery": {
        const chips = Math.min(15, input.discardsLeft * 5);
        jokerChipBonus += chips;
        if (chips) appliedEffects.push(applied(joker, "남은 버리기 충전", { chips }));
        break;
      }
      case "last-commit":
        if (input.handsLeftBeforePlay === 1) {
          multiplierBonus += 2;
          appliedEffects.push(applied(joker, "마지막 핸드", { multiplier: 2 }));
        }
        break;
      case "version-control":
        if (previousHand && previousHand !== input.evaluatedHand.type) {
          jokerChipBonus += 12;
          appliedEffects.push(applied(joker, "직전과 다른 족보", { chips: 12 }));
        }
        break;
      case "cmyk-core":
        if (scoringColors.size === 4) {
          xMultiplier *= 1.3;
          appliedEffects.push(applied(joker, "CMYK 4색 완성", { xMultiplier: 1.3 }));
        }
        break;
      case "combo-compiler": {
        if (!previousHand) return { ...joker, counter: 0 };
        if (previousHand === input.evaluatedHand.type) {
          return { ...joker, counter: 0 };
        }

        const counter = Math.min(4, (joker.counter ?? 0) + 1);
        const factor = 1 + counter * 0.08;
        xMultiplier *= factor;
        appliedEffects.push(
          applied(joker, `서로 다른 족보 ${counter}연속`, { xMultiplier: factor }),
        );
        return { ...joker, counter };
      }
      case "hot-swap":
        if (joker.selectedColor) {
          const chips = sumNumericChips(
            input.scoringCards.filter(
              (card) => card.color === joker.selectedColor,
            ),
          );
          jokerChipBonus += chips;
          if (chips) {
            appliedEffects.push(
              applied(joker, `${joker.selectedColor} 숫자 칩 재계산`, { chips }),
            );
          }
        }
        break;
      case "null-pointer":
        if (input.scoringCards.filter((card) => card.rank === 0).length >= 2) {
          xMultiplier *= 1.35;
          appliedEffects.push(applied(joker, "0 두 장 이상 득점", { xMultiplier: 1.35 }));
        }
        break;
    }

    return joker;
  });

  return {
    numericChips,
    jokerChipBonus,
    multiplierBonus,
    xMultiplier,
    coinGain,
    appliedEffects,
    updatedJokers,
  };
}
