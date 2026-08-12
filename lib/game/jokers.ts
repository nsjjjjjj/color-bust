import { JOKER_CATALOG, rankChipValue } from "./constants";
import { isFlushType, isStraightType } from "./hands";
import { nextRandom } from "./rng";
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
  /** Full held hand before this play's cards are removed. Used by cards that read what's still in hand. */
  readonly hand: readonly GameCard[];
  readonly evaluatedHand: EvaluatedHand;
  readonly handHistory: readonly HandType[];
  readonly handsLeftBeforePlay: number;
  readonly discardsLeft: number;
  /** Free MOD slots at the moment of scoring (jokerSlotLimitFor(state) - jokers.length). */
  readonly emptyJokerSlots: number;
  /** Deterministic RNG cursor consumed by probability-trigger MODs. */
  readonly rngState: number;
}

export interface JokerScoreResult {
  readonly numericChips: number;
  readonly jokerChipBonus: number;
  readonly multiplierBonus: number;
  readonly xMultiplier: number;
  readonly coinGain: number;
  readonly appliedEffects: readonly AppliedEffect[];
  readonly updatedJokers: readonly JokerInstance[];
  /** RNG cursor after consuming every roll made while scoring this hand. */
  readonly rngState: number;
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

const FIBONACCI_RANKS = new Set([1, 2, 3, 5, 8]);

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
  let rngCursor = input.rngState;

  function roll(): number {
    const result = nextRandom(rngCursor);
    rngCursor = result.nextState;
    return result.value;
  }

  // Per-index deltas captured around each MOD's own processing, so
  // blueprint-protocol can replay its right-hand neighbor's contribution
  // for this same hand without re-implementing every effect.
  const perJokerChips: number[] = new Array(input.jokers.length).fill(0);
  const perJokerMultiplier: number[] = new Array(input.jokers.length).fill(0);
  const perJokerXMultiplier: number[] = new Array(input.jokers.length).fill(1);
  const perJokerCoins: number[] = new Array(input.jokers.length).fill(0);

  const updatedJokers = input.jokers.map((joker, index): JokerInstance => {
    let updatedInstance: JokerInstance = joker;
    const chipsBefore = jokerChipBonus;
    const multiplierBeforeStep = multiplierBonus;
    const xMultiplierBefore = xMultiplier;
    const coinBefore = coinGain;

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
          appliedEffects.push(applied(joker, "RAGE 채널 과부하", { chips: 12 }, card.id));
        }
        break;
      }
      case "blue-buffer":
        {
          const blueCards = input.scoringCards.filter((card) => card.color === "blue");
          if (blueCards.length < 2) break;
          jokerChipBonus += 45;
          appliedEffects.push(
            applied(joker, "GLITCH 버퍼 2장 연결", { chips: 45 }, blueCards[1].id),
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
            applied(joker, "첫 핸드 VOLT 티켓", { coins: 2 }, yellow.id),
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
          appliedEffects.push(applied(joker, "재사용 족보 캐시", { multiplier: 4 }));
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
            applied(joker, "단색 족보 감지", { chips: 60, multiplier: 5 }),
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
          appliedEffects.push(applied(joker, "직전과 다른 족보", { chips: 60 }));
        }
        break;
      case "cmyk-core":
        if (scoringColors.size === 4) {
          xMultiplier *= 1.75;
          appliedEffects.push(applied(joker, "CMYK 4색 완성", { xMultiplier: 1.75 }));
        }
        break;
      case "combo-compiler": {
        if (!previousHand || previousHand === input.evaluatedHand.type) {
          updatedInstance = { ...joker, counter: 0 };
          break;
        }
        const counter = Math.min(5, (joker.counter ?? 0) + 1);
        const factor = 1 + counter * 0.15;
        xMultiplier *= factor;
        appliedEffects.push(
          applied(joker, `서로 다른 족보 ${counter}연속`, { xMultiplier: factor }),
        );
        updatedInstance = { ...joker, counter };
        break;
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

      case "venom-drip": {
        for (const card of input.scoringCards.filter(({ color }) => color === "green")) {
          multiplierBonus += 3;
          appliedEffects.push(applied(joker, "VENOM 신호 증폭", { multiplier: 3 }, card.id));
        }
        break;
      }
      case "volt-surge": {
        for (const card of input.scoringCards.filter(({ color }) => color === "yellow")) {
          jokerChipBonus += 10;
          appliedEffects.push(applied(joker, "VOLT 서지", { chips: 10 }, card.id));
        }
        break;
      }
      case "half-compile":
        if (input.selectedCards.length <= 3) {
          multiplierBonus += 10;
          appliedEffects.push(applied(joker, "경량 컴파일", { multiplier: 10 }));
        }
        break;
      case "ice-cream-cache": {
        const remaining = Math.max(0, joker.counter ?? 48);
        if (remaining > 0) {
          jokerChipBonus += remaining;
          appliedEffects.push(applied(joker, "캐시 방출", { chips: remaining }));
        }
        updatedInstance = { ...joker, counter: Math.max(0, remaining - 12) };
        break;
      }
      case "memory-buffer": {
        const chips = Math.min(3, input.handsLeftBeforePlay) * 18;
        if (chips) {
          jokerChipBonus += chips;
          appliedEffects.push(applied(joker, "남은 핸드 버퍼링", { chips }));
        }
        break;
      }
      case "mystic-summit":
        if (input.discardsLeft === 0) {
          multiplierBonus += 3;
          appliedEffects.push(applied(joker, "버리기 소진 서밋", { multiplier: 3 }));
        }
        break;
      case "fibonacci-routine": {
        for (const card of input.scoringCards.filter(({ rank }) => FIBONACCI_RANKS.has(rank))) {
          multiplierBonus += 3;
          appliedEffects.push(applied(joker, "피보나치 랭크", { multiplier: 3 }, card.id));
        }
        break;
      }
      case "loyalty-session": {
        const played = (joker.counter ?? 0) + 1;
        if (played % 6 === 0) {
          multiplierBonus += 15;
          appliedEffects.push(applied(joker, "6번째 핸드 세션", { multiplier: 15 }));
        }
        updatedInstance = { ...joker, counter: played };
        break;
      }
      case "jolly-routine":
        if (input.evaluatedHand.type === "pair") {
          multiplierBonus += 8;
          appliedEffects.push(applied(joker, "페어 루틴", { multiplier: 8 }));
        }
        break;
      case "zany-core":
        if (input.evaluatedHand.type === "three-of-a-kind") {
          multiplierBonus += 12;
          appliedEffects.push(applied(joker, "트리플 코어", { multiplier: 12 }));
        }
        break;
      case "mad-routine":
        if (input.evaluatedHand.type === "two-pair") {
          multiplierBonus += 10;
          appliedEffects.push(applied(joker, "투페어 루틴", { multiplier: 10 }));
        }
        break;
      case "runner-process": {
        if (!isStraightType(input.evaluatedHand.type)) break;
        const stored = joker.counter ?? 0;
        if (stored) {
          jokerChipBonus += stored;
          appliedEffects.push(applied(joker, "누적 프로세스 실행", { chips: stored }));
        }
        updatedInstance = { ...joker, counter: stored + 15 };
        break;
      }
      case "spare-trousers": {
        if (input.evaluatedHand.type !== "two-pair") break;
        const stored = joker.counter ?? 0;
        if (stored) {
          multiplierBonus += stored;
          appliedEffects.push(applied(joker, "누적 트라우저", { multiplier: stored }));
        }
        updatedInstance = { ...joker, counter: stored + 1 };
        break;
      }
      case "green-demon": {
        const stored = Math.max(0, joker.counter ?? 0);
        if (stored) {
          multiplierBonus += stored;
          appliedEffects.push(applied(joker, "데몬 누적치", { multiplier: stored }));
        }
        updatedInstance = { ...joker, counter: stored + 1 };
        break;
      }
      case "eight-ball-exploit": {
        for (const card of input.scoringCards.filter(({ rank }) => rank === 8)) {
          if (roll() < 0.25) {
            coinGain += 3;
            appliedEffects.push(applied(joker, "8번 익스플로잇 성공", { coins: 3 }, card.id));
          }
        }
        break;
      }
      case "bloodstone-driver": {
        for (const card of input.scoringCards.filter(({ color }) => color === "red")) {
          if (roll() < 0.5) {
            xMultiplier *= 1.2;
            appliedEffects.push(applied(joker, "혈석 드라이버 발동", { xMultiplier: 1.2 }, card.id));
          }
        }
        break;
      }
      case "reserved-slot": {
        for (const card of input.hand.filter(({ rank }) => rank === 0)) {
          if (roll() < 0.5) {
            coinGain += 1;
            appliedEffects.push(applied(joker, "예약 슬롯 발동", { coins: 1 }, card.id));
          }
        }
        break;
      }
      case "cavendish-overclock":
        xMultiplier *= 2;
        appliedEffects.push(applied(joker, "오버클럭 가동", { xMultiplier: 2 }));
        break;
      case "stencil-core": {
        const factor = 1 + 0.3 * Math.max(0, input.emptyJokerSlots);
        if (factor !== 1) {
          xMultiplier *= factor;
          appliedEffects.push(applied(joker, "빈 슬롯 스텐실", { xMultiplier: factor }));
        }
        break;
      }
      // blueprint-protocol, delayed-gratification, turtle-bean-cache and
      // perkeos-echo have no per-hand scoring effect of their own — see
      // the blueprint copy pass below and the round-lifecycle hooks in
      // engine.ts (nextRound / playHand's roundCleared branch).
    }

    perJokerChips[index] = jokerChipBonus - chipsBefore;
    perJokerMultiplier[index] = multiplierBonus - multiplierBeforeStep;
    perJokerXMultiplier[index] = xMultiplier / xMultiplierBefore;
    perJokerCoins[index] = coinGain - coinBefore;

    return updatedInstance;
  });

  // blueprint-protocol replays whatever its right-hand neighbor (the next
  // higher slot index) just contributed to this same hand.
  input.jokers.forEach((joker, index) => {
    if (joker.jokerId !== "blueprint-protocol") return;
    const neighbor = input.jokers[index + 1];
    if (!neighbor || neighbor.jokerId === "blueprint-protocol") return;

    const chips = perJokerChips[index + 1];
    const multiplier = perJokerMultiplier[index + 1];
    const xMult = perJokerXMultiplier[index + 1];
    const coins = perJokerCoins[index + 1];
    if (!chips && !multiplier && xMult === 1 && !coins) return;

    jokerChipBonus += chips;
    multiplierBonus += multiplier;
    xMultiplier *= xMult;
    coinGain += coins;
    appliedEffects.push(
      applied(
        joker,
        `오른쪽 MOD(${JOKER_CATALOG[neighbor.jokerId].name}) 복제`,
        {
          ...(chips ? { chips } : {}),
          ...(multiplier ? { multiplier } : {}),
          ...(xMult !== 1 ? { xMultiplier: xMult } : {}),
          ...(coins ? { coins } : {}),
        },
      ),
    );
  });

  return {
    numericChips,
    jokerChipBonus,
    multiplierBonus,
    xMultiplier,
    coinGain,
    appliedEffects,
    updatedJokers,
    rngState: rngCursor,
  };
}
