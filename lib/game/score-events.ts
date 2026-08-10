import { rankChipValue } from "./constants";
import type { AppliedEffect, GameCard, ScoreBreakdown } from "./types";

export type ScoreEventType =
  | "hand-detected"
  | "base-score"
  | "card-score"
  | "joker-effect"
  | "aggregate-adjustment"
  | "uno-effect"
  | "uno-result"
  | "final-score";

export type ScoreEventEmphasis = "subtle" | "normal" | "strong" | "final";

export type ScoreMultiplierMode = "base" | "additive" | "multiplicative";

export type ScoreEventOperation =
  | "announce"
  | "set-base"
  | "add-chips"
  | "add-multiplier"
  | "multiply-score"
  | "set-score";

/**
 * A presentation-safe scoring step. The UI may animate these events in order
 * without having to reproduce any game rules.
 */
export interface ScoreEvent {
  readonly id: string;
  readonly type: ScoreEventType;
  readonly label: string;
  readonly description: string;
  /** Chip/score delta, except on the base and final events where it is the value. */
  readonly value?: number;
  /** Additive multiplier delta, x-multiplier factor, or the base multiplier. */
  readonly multiplier?: number;
  readonly multiplierMode?: ScoreMultiplierMode;
  readonly operation: ScoreEventOperation;
  readonly sourceCardId?: string;
  readonly sourceEffectId?: string;
  /** Non-score rewards such as coins are exposed without changing currentTotal. */
  readonly reward?: number;
  readonly emphasis: ScoreEventEmphasis;
  /** The score that should be visible after this event has finished. */
  readonly currentTotal: number;
  /** Present on the final event for consumers that store a completed result. */
  readonly total?: number;
}

interface RunningScore {
  chips: number;
  multiplier: number;
  xMultiplier: number;
}

const COLOR_NAMES: Readonly<Record<GameCard["color"], string>> = {
  red: "빨강",
  blue: "파랑",
  green: "초록",
  yellow: "노랑",
};

function scoreFor(state: RunningScore): number {
  return Math.floor(
    Math.max(0, state.chips) *
      Math.max(0, state.multiplier) *
      Math.max(0, state.xMultiplier),
  );
}

function closeEnough(left: number, right: number): boolean {
  return Math.abs(left - right) <= Number.EPSILON * Math.max(1, left, right) * 8;
}

function effectEmphasis(effect: AppliedEffect): ScoreEventEmphasis {
  if (
    (effect.xMultiplier !== undefined && effect.xMultiplier !== 1) ||
    Math.abs(effect.multiplier ?? 0) >= 2 ||
    Math.abs(effect.chips ?? 0) >= 20
  ) {
    return "strong";
  }
  if (
    effect.chips === undefined &&
    effect.multiplier === undefined &&
    effect.xMultiplier === undefined
  ) {
    return "subtle";
  }
  return "normal";
}

function operationForEffect(effect: AppliedEffect): ScoreEventOperation {
  if (effect.xMultiplier !== undefined) return "multiply-score";
  if (effect.multiplier !== undefined) return "add-multiplier";
  if (effect.chips !== undefined) return "add-chips";
  return "announce";
}

function multiplierForEffect(
  effect: AppliedEffect,
): Pick<ScoreEvent, "multiplier" | "multiplierMode"> {
  if (effect.xMultiplier !== undefined) {
    return {
      multiplier: effect.xMultiplier,
      multiplierMode: "multiplicative",
    };
  }
  if (effect.multiplier !== undefined) {
    return {
      multiplier: effect.multiplier,
      multiplierMode: "additive",
    };
  }
  return {};
}

/**
 * Converts an authoritative score breakdown into a deterministic animation
 * timeline. Aggregate events reconcile grouped/missing effect details with the
 * totals produced by the game engine, so the UI never drifts from game state.
 */
export function buildScoreEvents(
  breakdown: ScoreBreakdown,
  selectedCards: readonly GameCard[],
): readonly ScoreEvent[] {
  const events: ScoreEvent[] = [];
  let sequence = 0;
  let visibleTotal = 0;

  const push = (
    event: Omit<ScoreEvent, "id"> & { readonly idHint: string },
  ): void => {
    const { idHint, ...scoreEvent } = event;
    sequence += 1;
    events.push({
      id: `score-${String(sequence).padStart(2, "0")}-${idHint}`,
      ...scoreEvent,
    });
    visibleTotal = scoreEvent.currentTotal;
  };

  push({
    idHint: "hand",
    type: "hand-detected",
    label: breakdown.handName,
    description: `레벨 ${breakdown.handLevel} 조합 판정`,
    operation: "announce",
    emphasis: "strong",
    currentTotal: 0,
  });

  const running: RunningScore = {
    chips: breakdown.baseChips,
    multiplier: breakdown.baseMultiplier,
    xMultiplier: 1,
  };

  push({
    idHint: "base",
    type: "base-score",
    label: "기본 조합 점수",
    description: `${breakdown.baseChips} 칩 × ${breakdown.baseMultiplier} 배수`,
    value: breakdown.baseChips,
    multiplier: breakdown.baseMultiplier,
    multiplierMode: "base",
    operation: "set-base",
    emphasis: "normal",
    currentTotal: scoreFor(running),
  });

  const scoringIds = new Set(breakdown.scoringCardIds);
  const scoringCards = selectedCards.filter((card) => scoringIds.has(card.id));

  for (const card of scoringCards) {
    const chips = rankChipValue(card.rank);
    running.chips += chips;
    push({
      idHint: `card-${card.id}`,
      type: "card-score",
      label: `${COLOR_NAMES[card.color]} ${card.rank}`,
      description:
        card.rank === 0
          ? "0 카드 특성으로 10칩 획득"
          : `숫자 카드 ${card.rank}에서 ${chips}칩 획득`,
      value: chips,
      operation: "add-chips",
      sourceCardId: card.id,
      emphasis: card.rank === 0 ? "strong" : "normal",
      currentTotal: scoreFor(running),
    });
  }

  const applyEffect = (
    effect: AppliedEffect,
    index: number,
    phase: "joker" | "uno",
  ): void => {
    running.chips += effect.chips ?? 0;
    running.multiplier += effect.multiplier ?? 0;
    running.xMultiplier *= effect.xMultiplier ?? 1;

    push({
      idHint: `${phase}-${index}-${effect.sourceId}`,
      type: phase === "joker" ? "joker-effect" : "uno-effect",
      label: effect.sourceName,
      description: effect.description,
      value: effect.chips,
      ...multiplierForEffect(effect),
      operation: operationForEffect(effect),
      sourceEffectId: effect.sourceId,
      reward: effect.coins,
      emphasis: effectEmphasis(effect),
      currentTotal: scoreFor(running),
    });
  };

  breakdown.appliedJokers.forEach((effect, index) => {
    applyEffect(effect, index, "joker");
  });

  const reconcileChips = (
    target: number,
    idHint: string,
    label: string,
  ): void => {
    const difference = target - running.chips;
    if (difference === 0) return;
    running.chips = target;
    push({
      idHint,
      type: "aggregate-adjustment",
      label,
      description: `세부 효과 합계를 실제 칩 총합 ${target}에 맞춤`,
      value: difference,
      operation: "add-chips",
      sourceEffectId: idHint,
      emphasis: "subtle",
      currentTotal: scoreFor(running),
    });
  };

  const reconcileMultiplier = (
    target: number,
    idHint: string,
    label: string,
  ): void => {
    const difference = target - running.multiplier;
    if (difference === 0) return;
    running.multiplier = target;
    push({
      idHint,
      type: "aggregate-adjustment",
      label,
      description: `세부 효과 합계를 실제 배수 ${target}에 맞춤`,
      multiplier: difference,
      multiplierMode: "additive",
      operation: "add-multiplier",
      sourceEffectId: idHint,
      emphasis: "subtle",
      currentTotal: scoreFor(running),
    });
  };

  const reconcileXMultiplier = (
    target: number,
    idHint: string,
    label: string,
  ): void => {
    if (closeEnough(running.xMultiplier, target)) {
      running.xMultiplier = target;
      return;
    }
    const factor = running.xMultiplier === 0 ? target : target / running.xMultiplier;
    running.xMultiplier = target;
    push({
      idHint,
      type: "aggregate-adjustment",
      label,
      description: `세부 효과 합계를 실제 곱 배수 ×${target}에 맞춤`,
      multiplier: factor,
      multiplierMode: "multiplicative",
      operation: "multiply-score",
      sourceEffectId: idHint,
      emphasis: "subtle",
      currentTotal: scoreFor(running),
    });
  };

  const reconcileDisplayedScore = (
    target: number,
    idHint: string,
    label: string,
  ): void => {
    const calculated = scoreFor(running);
    if (calculated === target && visibleTotal === target) return;
    push({
      idHint,
      type: "aggregate-adjustment",
      label,
      description: `반올림·상한을 포함한 실제 계산 결과 ${target}점 적용`,
      value: target - visibleTotal,
      operation: "set-score",
      sourceEffectId: idHint,
      emphasis: "subtle",
      currentTotal: target,
    });
  };

  reconcileChips(
    breakdown.chipsBeforeUno,
    "pre-uno-chip-total",
    "칩 효과 집계",
  );
  reconcileMultiplier(
    breakdown.multiplierBeforeUno,
    "pre-uno-multiplier-total",
    "배수 효과 집계",
  );
  reconcileXMultiplier(
    breakdown.jokerXMultiplier,
    "pre-uno-x-total",
    "곱 배수 효과 집계",
  );
  reconcileDisplayedScore(
    breakdown.scoreBeforeUno,
    "pre-uno-score-total",
    "효과 점수 확정",
  );

  if (breakdown.uno) {
    const uno = breakdown.uno;
    uno.appliedEffects.forEach((effect, index) => {
      applyEffect(effect, index, "uno");
    });

    reconcileChips(
      breakdown.chipsBeforeUno + uno.chipDelta,
      "uno-chip-total",
      "메이헴 칩 집계",
    );
    reconcileMultiplier(
      breakdown.multiplierBeforeUno + uno.multiplierDelta,
      "uno-multiplier-total",
      "메이헴 배수 집계",
    );
    reconcileXMultiplier(
      breakdown.jokerXMultiplier * uno.xMultiplier,
      "uno-x-total",
      "메이헴 곱 배수 집계",
    );
    reconcileDisplayedScore(
      uno.uncappedScore,
      "uno-uncapped-score",
      "메이헴 효과 합계",
    );

    const resultReason =
      uno.scoreAfterUno < uno.uncappedScore
        ? `점수 상한 ×${uno.capMultiplier} 적용`
        : uno.scoreAfterUno > uno.uncappedScore
          ? "기존 점수보다 낮아 점수 보호 적용"
          : "모든 메이헴 효과 적용";
    push({
      idHint: `uno-result-${uno.cardId}`,
      type: "uno-result",
      label: uno.cardName,
      description: `${COLOR_NAMES[uno.calledColor]} 호출 · ${resultReason}`,
      value: uno.scoreAfterUno - uno.scoreBeforeUno,
      operation: "set-score",
      sourceEffectId: uno.cardId,
      emphasis: "strong",
      currentTotal: uno.scoreAfterUno,
    });
  }

  if (visibleTotal !== breakdown.total) {
    push({
      idHint: "authoritative-total",
      type: "aggregate-adjustment",
      label: "최종 합계 보정",
      description: `게임 엔진의 실제 결과 ${breakdown.total}점 적용`,
      value: breakdown.total - visibleTotal,
      operation: "set-score",
      sourceEffectId: "authoritative-total",
      emphasis: "subtle",
      currentTotal: breakdown.total,
    });
  }

  push({
    idHint: "final",
    type: "final-score",
    label: "최종 점수",
    description: `${breakdown.handName} 계산 완료`,
    value: breakdown.total,
    operation: "set-score",
    emphasis: "final",
    currentTotal: breakdown.total,
    total: breakdown.total,
  });

  return events;
}
