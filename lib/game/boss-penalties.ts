import { CARD_COLORS } from "./constants";
import { COLOR_IDENTITIES } from "./colors";
import { randomInt } from "./rng";
import type { BossPenaltyId, CardColor, RunState } from "./types";

export interface BossPenalty {
  readonly id: BossPenaltyId;
  readonly name: string;
  readonly description: string;
  /** Applied after any player-owned hand bonuses for the round. */
  readonly handDelta?: number;
  /** Applied after any player-owned discard bonuses for the round. */
  readonly discardDelta?: number;
  /** Multiplies the normal boss target, after its standard boss scaling. */
  readonly targetMultiplier?: number;
  /** Overrides the round's hand count outright, ignoring firmware/handDelta. */
  readonly handsOverride?: number;
  /** Applied to the round's starting hand size, clamped to a minimum of 3. */
  readonly handSizeDelta?: number;
  /** Multiplies base hand CHIPS and MULT (before MOD/enhancement bonuses). */
  readonly scoreMultiplier?: number;
  /** Forces this many random cards out of hand after every play, free of a discard charge. */
  readonly autoDiscardAfterPlay?: number;
  /** A hand type already played this round can't be played again. */
  readonly noRepeatHandType?: boolean;
  /** Every hand this round must match the type of the first hand played. */
  readonly lockFirstHandType?: boolean;
  /** Rolls a random CardColor at round start; that color scores no chips/enhancements. */
  readonly debuffsColor?: boolean;
  /**
   * Earliest ante this penalty can be rolled for, inclusive. Defaults to 1
   * (available from the very first boss). The standard run ends at ante 5,
   * so `minAnte: 6` reserves an effect for Endless only, once a player has
   * had a full run to build up jokers/enhancements to withstand it.
   */
  readonly minAnte?: number;
}

/**
 * The full boss effect pool, styled after Balatro's boss blinds and adapted
 * to color-bust's COLOR/RANK deck. One is rolled at random whenever a boss
 * round starts (see rollBossPenalty), from the very first STAGE through
 * Endless, so the sequence never repeats the exact same run twice.
 */
export const BOSS_PENALTIES: readonly BossPenalty[] = [
  {
    id: "channel-jam",
    name: "채널 재밍",
    description: "이번 보스전 버리기 -1",
    discardDelta: -1,
  },
  {
    id: "hand-drain",
    name: "손패 누수",
    description: "이번 보스전 내기 횟수 -1",
    handDelta: -1,
  },
  {
    id: "signal-surge",
    name: "신호 증폭",
    description: "이번 보스전 목표 점수 +12%",
    targetMultiplier: 1.12,
  },
  {
    id: "hard-lock",
    name: "완전 봉쇄",
    description: "이번 보스전 버리기 불가",
    discardDelta: -99,
    minAnte: 6,
  },
  {
    id: "final-gate",
    name: "최종 관문",
    description: "내기 횟수 -1 · 목표 점수 +8%",
    handDelta: -1,
    targetMultiplier: 1.08,
    minAnte: 6,
  },
  {
    id: "color-jam",
    name: "컬러 재머",
    description: "이번 보스전 {color} 카드 무효화 (득점 0)",
    debuffsColor: true,
  },
  {
    id: "flint-cut",
    name: "출력 제한",
    description: "이번 보스전 족보 칩/배수 50% 감소",
    scoreMultiplier: 0.5,
    minAnte: 6,
  },
  {
    id: "pattern-lock",
    name: "패턴 차단",
    description: "이번 보스전 같은 족보 재사용 불가",
    noRepeatHandType: true,
  },
  {
    id: "mono-track",
    name: "단일 채널",
    description: "이번 보스전 첫 제출 족보만 계속 사용 가능",
    lockFirstHandType: true,
    minAnte: 6,
  },
  {
    id: "one-shot",
    name: "속전속결",
    description: "이번 보스전 내기 횟수 3회 고정",
    handsOverride: 3,
    minAnte: 6,
  },
  {
    id: "narrow-hand",
    name: "좁은 슬롯",
    description: "이번 보스전 시작 손패 -2장",
    handSizeDelta: -2,
  },
  {
    id: "forced-purge",
    name: "강제 방출",
    description: "핸드 제출 후 무작위 카드 2장 자동 버리기",
    autoDiscardAfterPlay: 2,
  },
];

export function bossPenaltyById(
  id: BossPenalty["id"] | null | undefined,
): BossPenalty | null {
  if (!id) return null;
  return BOSS_PENALTIES.find((penalty) => penalty.id === id) ?? null;
}

/**
 * Rolls the boss effect for a round that's about to start. Draws uniformly
 * from every effect unlocked at `ante` (see `BossPenalty.minAnte`) — the
 * standard run's antes 1-5 only see the gentler pool, so a first-time run
 * never opens on something like a single-hand target or a halved score;
 * the harsher effects only start appearing once a run reaches Endless.
 * Re-rolls once if it would repeat the previous boss round's effect.
 * Effects flagged `debuffsColor` also roll which CardColor is jammed.
 */
export function rollBossPenalty(
  rngState: number,
  ante: number,
  previousId?: BossPenalty["id"] | null,
): {
  readonly penalty: BossPenalty;
  readonly debuffColor: CardColor | null;
  readonly nextState: number;
} {
  const pool = BOSS_PENALTIES.filter((penalty) => (penalty.minAnte ?? 1) <= ante);

  let pick = randomInt(rngState, 0, pool.length);
  let penalty = pool[pick.value];

  if (pool.length > 1 && penalty.id === previousId) {
    pick = randomInt(pick.nextState, 0, pool.length);
    penalty = pool[pick.value];
  }

  let nextState = pick.nextState;
  let debuffColor: CardColor | null = null;
  if (penalty.debuffsColor) {
    const colorPick = randomInt(nextState, 0, CARD_COLORS.length);
    debuffColor = CARD_COLORS[colorPick.value];
    nextState = colorPick.nextState;
  }

  return { penalty, debuffColor, nextState };
}

/**
 * Resolves the active boss penalty for the round currently in progress, with
 * any dynamic detail (its jammed color) already filled into the description.
 * Returns null outside boss rounds or for legacy saves without a roll stored.
 */
export function bossPenaltyFor(state: RunState): BossPenalty | null {
  if (state.round !== "boss") return null;
  const penalty = bossPenaltyById(state.bossPenaltyId);
  if (!penalty) return null;
  if (penalty.debuffsColor && state.bossDebuffColor) {
    return {
      ...penalty,
      description: penalty.description.replace(
        "{color}",
        COLOR_IDENTITIES[state.bossDebuffColor].koreanColor,
      ),
    };
  }
  return penalty;
}
