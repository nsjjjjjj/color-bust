"use client";

import { useEffect, useMemo, useState } from "react";

import type { RoundReward, RunState } from "../../lib/game/types";

const ROUND_LABELS: Readonly<Record<RunState["round"], string>> = {
  small: "WARM-UP",
  big: "BREAKPOINT",
  boss: "MAYHEM ROUND",
};

type RewardLine = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly value: number;
  readonly symbol: string;
};

export interface RoundRewardViewProps {
  readonly run: RunState;
  readonly embedded?: boolean;
  /** Defaults to run.pendingReward while the engine is in the reward phase. */
  readonly reward?: RoundReward | null;
  readonly notice?: string;
  readonly claiming?: boolean;
  readonly reducedMotion?: boolean;
  readonly onClaim: () => void;
}

type RewardCountState = {
  readonly values: readonly number[];
  readonly total: number;
  readonly activeIndex: number | null;
  readonly revealedCount: number;
  readonly complete: boolean;
};

const REWARD_COUNT_STAGGER_MS = 260;
const REWARD_COUNT_DURATION_MS = 480;
const REWARD_COUNT_LEAD_MS = 160;

function easeOutCubic(value: number): number {
  return 1 - ((1 - value) ** 3);
}

export function RoundRewardView({
  run,
  embedded = false,
  reward = run.pendingReward ?? null,
  notice = "",
  claiming = false,
  reducedMotion = false,
  onClaim,
}: RoundRewardViewProps) {
  if (!reward) {
    return (
      <section className={`dm-reward${embedded ? " dm-reward--embedded" : ""}`} aria-labelledby="dm-reward-title">
        <section className="dm-reward__card is-empty">
          <span>REWARD SIGNAL LOST</span>
          <h1 id="dm-reward-title">정산할 보상이 없습니다</h1>
          <p role="status">런 상태를 다시 확인해주세요.</p>
        </section>
      </section>
    );
  }

  return (
    <RewardReceipt
      key={`${run.runId}:${run.roundNumber}:${reward.total}`}
      run={run}
      reward={reward}
      embedded={embedded}
      notice={notice}
      claiming={claiming}
      reducedMotion={reducedMotion}
      onClaim={onClaim}
    />
  );
}

function RewardReceipt({
  run,
  reward,
  embedded,
  notice,
  claiming,
  reducedMotion,
  onClaim,
}: Required<Pick<RoundRewardViewProps, "run" | "embedded" | "notice" | "claiming" | "reducedMotion" | "onClaim">> & { readonly reward: RoundReward }) {
  const lines: readonly RewardLine[] = [
    {
      id: "base",
      label: "TARGET CLEAR",
      description: `${ROUND_LABELS[run.round]} 기본 보상`,
      value: reward.baseCoins,
      symbol: "✓",
    },
    {
      id: "hands",
      label: "HAND BONUS",
      description: "남겨둔 핸드 보너스",
      value: reward.handBonus,
      symbol: "H",
    },
    {
      id: "reserve",
      label: "RESERVE",
      description: "보유 금액 예비금 보너스",
      value: reward.reserveBonus,
      symbol: "R",
    },
    {
      id: "mods",
      label: "MOD INCOME",
      description: "장착 MOD가 생성한 수입",
      value: reward.modIncome,
      symbol: "M",
    },
  ];
  const rewardValues = useMemo(() => [
    reward.baseCoins,
    reward.handBonus,
    reward.reserveBonus,
    reward.modIncome,
  ], [reward.baseCoins, reward.handBonus, reward.modIncome, reward.reserveBonus]);
  const [countState, setCountState] = useState<RewardCountState>(() => reducedMotion
    ? { values: rewardValues, total: reward.total, activeIndex: null, revealedCount: rewardValues.length, complete: true }
    : { values: rewardValues.map(() => 0), total: 0, activeIndex: null, revealedCount: 0, complete: false });

  useEffect(() => {
    if (reducedMotion) return;

    const animationStart = performance.now() + REWARD_COUNT_LEAD_MS;
    const animationEnd = animationStart
      + ((rewardValues.length - 1) * REWARD_COUNT_STAGGER_MS)
      + REWARD_COUNT_DURATION_MS;
    let frame = 0;

    const tick = (now: number) => {
      const values = rewardValues.map((value, index) => {
        const lineStart = animationStart + (index * REWARD_COUNT_STAGGER_MS);
        const progress = Math.max(0, Math.min(1, (now - lineStart) / REWARD_COUNT_DURATION_MS));
        return Math.min(value, Math.round(value * easeOutCubic(progress)));
      });
      const complete = now >= animationEnd;
      const activeIndex = complete
        ? -1
        : rewardValues.findIndex((_, index) => {
          const lineStart = animationStart + (index * REWARD_COUNT_STAGGER_MS);
          return now >= lineStart && now < lineStart + REWARD_COUNT_DURATION_MS;
        });
      const visibleTotal = complete
        ? reward.total
        : Math.min(reward.total, values.reduce((sum, value) => sum + value, 0));
      const revealedCount = complete
        ? rewardValues.length
        : rewardValues.filter((_, index) => now >= animationStart + (index * REWARD_COUNT_STAGGER_MS) + REWARD_COUNT_DURATION_MS).length;

      setCountState({
        values: complete ? rewardValues : values,
        total: visibleTotal,
        activeIndex: activeIndex >= 0 ? activeIndex : null,
        revealedCount,
        complete,
      });

      if (!complete) frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [reducedMotion, reward.total, rewardValues]);

  return (
    <section className={`dm-reward${embedded ? " dm-reward--embedded" : ""}${claiming ? " is-leaving" : ""}`} aria-labelledby="dm-reward-title">
      <div className="dm-reward__backdrop" aria-hidden="true">
        <i /><i /><i /><i />
      </div>
      <section className="dm-reward__card">
        <header className="dm-reward__header">
          <div className="dm-reward__clear-mark" aria-hidden="true">
            <span>✓</span>
          </div>
          <div>
            <span>STAGE {run.ante} · {ROUND_LABELS[run.round]}</span>
            <h1 id="dm-reward-title">
              <button
                type="button"
                className="dm-reward__title-claim"
                disabled={claiming || !countState.complete}
                aria-busy={claiming || !countState.complete}
                onClick={onClaim}
              >
                {claiming
                  ? "코인 수령 중…"
                  : countState.complete
                    ? `캐시 아웃: +${countState.total}¢`
                    : `보상 계산 중: +${countState.total}¢`}
              </button>
            </h1>
            <p>목표 {run.target.toLocaleString()} POINT 달성 · 보상 명세를 확인하고 직접 수령하세요.</p>
          </div>
        </header>

        <div className="dm-reward__wallets" aria-label="보상 전후 지갑">
          <div>
            <span>현재 지갑</span>
            <strong>{run.coins}¢</strong>
          </div>
          <span className="dm-reward__wallet-arrow" aria-hidden="true">→</span>
          <div className="is-after">
            <span>수령 후</span>
            <strong key={`wallet-${countState.total}`} className="dm-reward__coin-tick">{run.coins + countState.total}¢</strong>
          </div>
        </div>

        <ol className="dm-reward__ledger" aria-label="라운드 보상 상세">
          {lines.map((line, index) => (
            <li
              className="dm-reward__line"
              data-zero={line.value === 0 || undefined}
              data-count-state={index < countState.revealedCount ? "counted" : countState.activeIndex === index ? "counting" : "pending"}
              style={{ animationDelay: `${index * 75}ms` }}
              key={line.id}
            >
              <span className="dm-reward__line-icon" aria-hidden="true">{line.symbol}</span>
              <span className="dm-reward__line-copy">
                <b>{line.label}</b>
                <small>{line.description}</small>
              </span>
              <output
                className="dm-reward__coin-tick"
                key={`${line.id}-${countState.values[index]}`}
                aria-label={`${line.description} ${line.value}코인`}
              >
                +{countState.values[index]}¢
              </output>
            </li>
          ))}
        </ol>

        <section className="dm-reward__total" data-counting={!countState.complete || undefined} aria-label={`총 보상 ${reward.total}코인`}>
          <div>
            <span>TOTAL PAYOUT</span>
            <small>이번 라운드 총 획득</small>
          </div>
          <output className="dm-reward__coin-tick" key={`total-${countState.total}`}>+{countState.total}¢</output>
        </section>

        <p className="dm-reward__notice" role="status" aria-live="polite">
          {notice || (countState.complete ? `위 캐시 아웃을 누르면 보상을 받고 ${reward.nextPhase === "won" ? "결과 화면" : "상점"}으로 이동합니다.` : "항목별 보상을 계산하는 중입니다.")}
        </p>
      </section>
    </section>
  );
}
