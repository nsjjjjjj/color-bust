import {
  HAND_RULES,
  UNO_MODULE_CATALOG,
  UNO_SCORE_CAP,
  rankChipValue,
} from "./constants";
import type {
  AppliedEffect,
  CardColor,
  CommunityUnoCard,
  GameCard,
  UnoModuleId,
  UnoScoreBreakdown,
  UnoValidationResult,
} from "./types";

export function validateCommunityUnoCard(
  card: CommunityUnoCard,
): UnoValidationResult {
  const errors: string[] = [];

  if (!card.id.trim()) errors.push("카드 ID가 필요합니다.");
  if (!card.name.trim()) errors.push("카드 이름이 필요합니다.");
  if (!card.author.trim()) errors.push("제작자 이름이 필요합니다.");
  if (!Number.isInteger(card.version) || card.version < 1) {
    errors.push("버전은 1 이상의 정수여야 합니다.");
  }

  if (card.positiveModules.length < 1 || card.positiveModules.length > 2) {
    errors.push("긍정 모듈은 1~2개여야 합니다.");
  }
  if (card.negativeModules.length < 1 || card.negativeModules.length > 2) {
    errors.push("부정 모듈은 1~2개여야 합니다.");
  }

  const allModuleIds = [...card.positiveModules, ...card.negativeModules];
  if (new Set(allModuleIds).size !== allModuleIds.length) {
    errors.push("같은 모듈을 중복해서 장착할 수 없습니다.");
  }

  for (const moduleId of card.positiveModules) {
    if (UNO_MODULE_CATALOG[moduleId]?.kind !== "positive") {
      errors.push(`${moduleId}은(는) 유효한 긍정 모듈이 아닙니다.`);
    }
  }
  for (const moduleId of card.negativeModules) {
    if (UNO_MODULE_CATALOG[moduleId]?.kind !== "negative") {
      errors.push(`${moduleId}은(는) 유효한 부정 모듈이 아닙니다.`);
    }
  }

  const pointTotal = allModuleIds.reduce(
    (total, moduleId) => total + (UNO_MODULE_CATALOG[moduleId]?.points ?? 0),
    0,
  );
  if (pointTotal !== 0) {
    errors.push(`모듈 포인트 합은 0이어야 합니다. 현재 합: ${pointTotal}`);
  }

  return { valid: errors.length === 0, pointTotal, errors };
}

export function assertValidCommunityUnoCard(card: CommunityUnoCard): void {
  const validation = validateCommunityUnoCard(card);
  if (!validation.valid) {
    throw new Error(`Invalid community UNO card: ${validation.errors.join(" ")}`);
  }
}

export interface ApplyUnoInput {
  readonly card: CommunityUnoCard;
  readonly calledColor: CardColor;
  readonly scoringCards: readonly GameCard[];
  readonly chipsBeforeUno: number;
  readonly multiplierBeforeUno: number;
  readonly jokerXMultiplier: number;
  readonly scoreBeforeUno: number;
  readonly handsLeftBeforePlay: number;
}

function effect(
  sourceId: string,
  description: string,
  values: Partial<Pick<AppliedEffect, "chips" | "multiplier" | "xMultiplier">>,
): AppliedEffect {
  const definition =
    sourceId === "color-call"
      ? undefined
      : UNO_MODULE_CATALOG[sourceId as UnoModuleId];
  return {
    sourceId,
    sourceName: definition?.name ?? "Color Call",
    description,
    ...values,
  };
}

export function applyCommunityUno(input: ApplyUnoInput): UnoScoreBreakdown {
  assertValidCommunityUnoCard(input.card);

  const calledCount = input.scoringCards.filter(
    (card) => card.color === input.calledColor,
  ).length;
  const offColorCount = input.scoringCards.length - calledCount;
  const scoringColors = new Set(input.scoringCards.map((card) => card.color));
  const narrowBand = input.card.negativeModules.includes("narrow-band");
  const positiveModulesDisabled =
    input.card.negativeModules.includes("single-channel") && calledCount < 2;
  const colorCallCap = narrowBand ? 6 : 10;
  const colorCallChips = Math.min(calledCount * 2, colorCallCap);
  const appliedEffects: AppliedEffect[] = [
    effect(
      "color-call",
      `호출한 ${input.calledColor} 카드 ${calledCount}장`,
      { chips: colorCallChips },
    ),
  ];

  let positiveChips = 0;
  let multiplierDelta = 0;
  let xMultiplier = 1;

  if (!positiveModulesDisabled) {
    for (const moduleId of input.card.positiveModules) {
      switch (moduleId) {
        case "color-burst": {
          const chips = calledCount >= 2 ? 8 : 0;
          positiveChips += chips;
          if (chips) appliedEffects.push(effect(moduleId, "호출 색 2장 이상", { chips }));
          break;
        }
        case "number-echo": {
          const chips = Math.min(
            10,
            Math.max(...input.scoringCards.map((card) => rankChipValue(card.rank))),
          );
          positiveChips += chips;
          appliedEffects.push(effect(moduleId, "가장 높은 숫자 칩 반복", { chips }));
          break;
        }
        case "steady-mult":
          multiplierDelta += 1;
          appliedEffects.push(effect(moduleId, "고정 배수 증가", { multiplier: 1 }));
          break;
        case "low-frequency": {
          const chips = Math.min(
            12,
            input.scoringCards.filter((card) => card.rank <= 3).length * 3,
          );
          positiveChips += chips;
          if (chips) appliedEffects.push(effect(moduleId, "0~3 득점 카드 증폭", { chips }));
          break;
        }
        case "double-call": {
          const chips = Math.min(calledCount * 2, 10);
          positiveChips += chips;
          if (chips) appliedEffects.push(effect(moduleId, "Color Call 한 번 더", { chips }));
          break;
        }
        case "spectrum-drive":
          if (scoringColors.size >= 3) {
            multiplierDelta += 2;
            appliedEffects.push(effect(moduleId, "3색 이상 득점", { multiplier: 2 }));
          }
          break;
        case "precision-boost":
          if (input.scoringCards.length === 5) {
            xMultiplier *= 1.25;
            appliedEffects.push(effect(moduleId, "정확히 5장 득점", { xMultiplier: 1.25 }));
          }
          break;
        case "last-signal":
          if (input.handsLeftBeforePlay === 1) {
            xMultiplier *= 1.3;
            appliedEffects.push(effect(moduleId, "마지막 핸드", { xMultiplier: 1.3 }));
          }
          break;
      }
    }
  } else {
    appliedEffects.push(
      effect("single-channel", "호출한 색이 2장 미만이라 긍정 모듈 비활성", {}),
    );
  }

  if (input.card.negativeModules.includes("weak-start")) {
    const reduction = positiveChips - Math.floor(positiveChips / 2);
    positiveChips -= reduction;
    if (reduction) {
      appliedEffects.push(effect("weak-start", "긍정 모듈 칩 절반 감소", { chips: -reduction }));
    }
  }

  let chipDelta = colorCallChips + positiveChips;
  let capMultiplier = UNO_SCORE_CAP;

  for (const moduleId of input.card.negativeModules) {
    switch (moduleId) {
      case "off-color-tax": {
        const chips = Math.min(offColorCount * 2, 8);
        chipDelta -= chips;
        if (chips) appliedEffects.push(effect(moduleId, "호출하지 않은 색 세금", { chips: -chips }));
        break;
      }
      case "signal-loss":
        chipDelta -= 6;
        appliedEffects.push(effect(moduleId, "고정 신호 손실", { chips: -6 }));
        break;
      case "mult-drain":
        multiplierDelta -= 1;
        appliedEffects.push(effect(moduleId, "배수 누수", { multiplier: -1 }));
        break;
      case "narrow-band":
        appliedEffects.push(effect(moduleId, "Color Call 최대 +6 칩", {}));
        break;
      case "glass-output":
        xMultiplier *= 0.75;
        appliedEffects.push(effect(moduleId, "불안정한 유리 출력", { xMultiplier: 0.75 }));
        break;
      case "single-channel":
      case "weak-start":
        break;
      case "hard-cap":
        capMultiplier = 1.3;
        appliedEffects.push(effect(moduleId, "UNO 상승 상한 ×1.30", {}));
        break;
    }
  }

  const unoChips = Math.max(0, input.chipsBeforeUno + chipDelta);
  const unoMultiplier = Math.max(0, input.multiplierBeforeUno + multiplierDelta);
  const uncappedScore = Math.floor(
    unoChips * unoMultiplier * input.jokerXMultiplier * xMultiplier,
  );
  const maximumScore = Math.floor(input.scoreBeforeUno * capMultiplier);
  // A valid UNO never makes a hand worse; its debuffs pay for stronger modules.
  const scoreAfterUno = Math.max(
    input.scoreBeforeUno,
    Math.min(uncappedScore, maximumScore),
  );

  return {
    cardId: input.card.id,
    cardName: input.card.name,
    calledColor: input.calledColor,
    colorCallChips,
    chipDelta,
    multiplierDelta,
    xMultiplier,
    capMultiplier,
    scoreBeforeUno: input.scoreBeforeUno,
    uncappedScore,
    scoreAfterUno,
    appliedEffects,
  };
}

/** Useful to preview a card in the builder without duplicating the score rules. */
export function describeUnoModule(moduleId: string): string {
  const definition = UNO_MODULE_CATALOG[moduleId as keyof typeof UNO_MODULE_CATALOG];
  return definition?.description ?? "알 수 없는 모듈";
}

/** A small exported guard for UIs that accept untyped JSON from the API. */
export function isKnownUnoModule(moduleId: string): boolean {
  return moduleId in UNO_MODULE_CATALOG;
}

export const UNO_BASE_DESCRIPTION =
  "Color Call: 호출한 색의 실제 득점 카드마다 +2 칩 (최대 +10)";

export const UNO_BUILDER_RULE =
  "긍정 모듈 1~2개와 부정 모듈 1~2개를 선택하고 포인트 합을 0으로 맞춥니다.";

export const UNO_HAND_REFERENCE = HAND_RULES;
