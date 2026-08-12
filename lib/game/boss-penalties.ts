import type { RoundType } from "./types";

export interface BossPenalty {
  readonly id: "channel-jam" | "hand-drain" | "signal-surge" | "hard-lock" | "final-gate";
  readonly name: string;
  readonly description: string;
  /** Applied after any player-owned hand bonuses for the round. */
  readonly handDelta?: number;
  /** Applied after any player-owned discard bonuses for the round. */
  readonly discardDelta?: number;
  /** Multiplies the normal boss target, after its standard boss scaling. */
  readonly targetMultiplier?: number;
}

/**
 * Each STAGE boss gets one deterministic modifier.  The sequence loops in
 * Endless, keeping the warning understandable after saving/reloading a run
 * without adding another persisted state field.
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
  },
  {
    id: "final-gate",
    name: "최종 관문",
    description: "내기 횟수 -1 · 목표 점수 +8%",
    handDelta: -1,
    targetMultiplier: 1.08,
  },
];

export function bossPenaltyFor(ante: number, round: RoundType): BossPenalty | null {
  if (round !== "boss") return null;
  const normalizedAnte = Math.max(1, Math.floor(ante));
  return BOSS_PENALTIES[(normalizedAnte - 1) % BOSS_PENALTIES.length] ?? null;
}
