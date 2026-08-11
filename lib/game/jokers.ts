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
  sourceCardId?: string,
): AppliedEffect {
  return {
    sourceId: joker.jokerId,
    sourceName: JOKER_CATALOG[joker.jokerId].name,
    description,
    sourceKind: "mod",
    ...(sourceCardId ? { sourceCardId } : {}),
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
    const scoringIds = new Set(input.scoringCards.map((card) => card.id));
    for (const card of input.selectedCards) {
      if (scoringIds.has(card.id)) continue;
      const chips = rankChipValue(card.rank);
      appliedEffects.push(
        applied(joker, "비득점 제출 카드도 숫자 POWER 계산", { chips }, card.id),
      );
    }
  }

  const scoringColors = new Set(input.scoringCards.map((card) => card.color));
  const scoringRankCounts = new Map<number, number>();
  for (const card of input.scoringCards) {
    scoringRankCounts.set(card.rank, (scoringRankCounts.get(card.rank) ?? 0) + 1);
  }

  const previousHand = input.handHistory[input.handHistory.length - 1];
  let jokerChipBonus = 0;
  let multiplierBonus = 0;
  let xMultiplier = 1;
  let coinGain = 0;

  const updatedJokers = input.jokers.map((joker): JokerInstance => {
    switch (joker.jokerId) {
      case "zero-day":
        {
          const zero = input.scoringCards.find((card) => card.rank === 0);
          if (!zero) break;
          multiplierBonus += 4;
          appliedEffects.push(applied(joker, "0 신호 증폭", { multiplier: 4 }, zero.id));
        }
        break;
      case "redline": {
        for (const card of input.scoringCards.filter(({ color }) => color === "red")) {
          jokerChipBonus += 12;
          appliedEffects.push(applied(joker, "빨강 채널 과부하", { chips: 12 }, card.id));
        }
        break;
      }
      case "blue-buffer":
        {
          const blueCards = input.scoringCards.filter((card) => card.color === "blue");
          if (blueCards.length < 2) break;
          jokerChipBonus += 45;
          appliedEffects.push(
            applied(joker, "파랑 버퍼 2장 연결", { chips: 45 }, blueCards[1].id),
          );
        }
        break;
      case "green-loop":
        {
          const duplicate = input.scoringCards.find(
            (card) => (scoringRankCounts.get(card.rank) ?? 0) >= 2,
          );
          if (!duplicate) break;
          jokerChipBonus += 40;
          appliedEffects.push(
            applied(joker, "동일 숫자 루프", { chips: 40 }, duplicate.id),
          );
        }
        break;
      case "yellow-ticket":
        {
          const yellow = input.scoringCards.find((card) => card.color === "yellow");
          if (input.handHistory.length !== 0 || !yellow) break;
          coinGain += 2;
          appliedEffects.push(
            applied(joker, "첫 핸드 노랑 티켓", { coins: 2 }, yellow.id),
          );
        }
        break;
      case "odd-signal": {
        for (const card of input.scoringCards.filter(({ rank }) => rank % 2 === 1)) {
          jokerChipBonus += 8;
          appliedEffects.push(applied(joker, "홀수 신호", { chips: 8 }, card.id));
        }
        break;
      }
      case "even-signal": {
        for (const card of input.scoringCards.filter(({ rank }) => rank % 2 === 0)) {
          jokerChipBonus += 8;
          appliedEffects.push(applied(joker, "짝수 신호", { chips: 8 }, card.id));
        }
        break;
      }
      case "cache-hit":
        if (input.handHistory.includes(input.evaluatedHand.type)) {
          multiplierBonus += 4;
          appliedEffects.push(applied(joker, "재사용 패턴 캐시", { multiplier: 4 }));
        }
        break;
      case "splash-mode":
        break;
      case "spectrum-analyzer":
        if (scoringColors.size === 4) {
          jokerChipBonus += 50;
          multiplierBonus += 5;
          appliedEffects.push(
            applied(joker, "4색 스펙트럼 완성", { chips: 50, multiplier: 5 }),
          );
        }
        break;
      case "monochrome-monitor":
        if (isFlushType(input.evaluatedHand.type)) {
          jokerChipBonus += 60;
          multiplierBonus += 5;
          appliedEffects.push(
            applied(joker, "단색 패턴 감지", { chips: 60, multiplier: 5 }),
          );
        }
        break;
      case "sequence-accelerator":
        if (isStraightType(input.evaluatedHand.type)) {
          multiplierBonus += 7;
          appliedEffects.push(applied(joker, "연속 신호 가속", { multiplier: 7 }));
        }
        break;
      case "full-stack":
        if (input.evaluatedHand.type === "full-house") {
          jokerChipBonus += 120;
          appliedEffects.push(applied(joker, "풀 스택 완성", { chips: 120 }));
        }
        break;
      case "spare-battery": {
        const chips = Math.min(75, input.discardsLeft * 25);
        jokerChipBonus += chips;
        if (chips) appliedEffects.push(applied(joker, "남은 버리기 충전", { chips }));
        break;
      }
      case "last-commit":
        if (input.handsLeftBeforePlay === 1) {
          multiplierBonus += 12;
          appliedEffects.push(applied(joker, "마지막 커밋", { multiplier: 12 }));
        }
        break;
      case "version-control":
        if (previousHand && previousHand !== input.evaluatedHand.type) {
          jokerChipBonus += 60;
          appliedEffects.push(applied(joker, "직전과 다른 패턴", { chips: 60 }));
        }
        break;
      case "cmyk-core":
        if (scoringColors.size === 4) {
          xMultiplier *= 1.75;
          appliedEffects.push(applied(joker, "CMYK 4색 완성", { xMultiplier: 1.75 }));
        }
        break;
      case "combo-compiler": {
        if (!previousHand) return { ...joker, counter: 0 };
        if (previousHand === input.evaluatedHand.type) {
          return { ...joker, counter: 0 };
        }

        const counter = Math.min(5, (joker.counter ?? 0) + 1);
        const factor = 1 + counter * 0.15;
        xMultiplier *= factor;
        appliedEffects.push(
          applied(joker, `서로 다른 족보 ${counter}연속`, { xMultiplier: factor }),
        );
        return { ...joker, counter };
      }
      case "hot-swap":
        if (joker.selectedColor) {
          const matchingCards = input.scoringCards.filter(
            (card) => card.color === joker.selectedColor,
          );
          for (const card of matchingCards) {
            const chips = rankChipValue(card.rank) * 2;
            jokerChipBonus += chips;
            appliedEffects.push(
              applied(joker, `${joker.selectedColor} POWER 2회 재계산`, { chips }, card.id),
            );
          }
          if (matchingCards.length >= 2) {
            multiplierBonus += 4;
            appliedEffects.push(
              applied(joker, "동일 채널 2장 연결", { multiplier: 4 }, matchingCards[1].id),
            );
          }
        }
        break;
      case "null-pointer":
        if (input.scoringCards.filter((card) => card.rank === 0).length >= 2) {
          xMultiplier *= 2.25;
          appliedEffects.push(applied(joker, "0 두 장 이상 득점", { xMultiplier: 2.25 }));
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
