"use client";

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
  /** Defaults to run.pendingReward while the engine is in the reward phase. */
  readonly reward?: RoundReward | null;
  readonly notice?: string;
  readonly claiming?: boolean;
  readonly onClaim: () => void;
}

export function RoundRewardView({
  run,
  reward = run.pendingReward ?? null,
  notice = "",
  claiming = false,
  onClaim,
}: RoundRewardViewProps) {
  if (!reward) {
    return (
      <main className="dm-reward" aria-labelledby="dm-reward-title">
        <section className="dm-reward__card is-empty">
          <span>REWARD SIGNAL LOST</span>
          <h1 id="dm-reward-title">정산할 보상이 없습니다</h1>
          <p role="status">런 상태를 다시 확인해주세요.</p>
        </section>
      </main>
    );
  }

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
  const destination = reward.nextPhase === "won" ? "결과 확인" : "GARAGE 입장";

  return (
    <main className="dm-reward" aria-labelledby="dm-reward-title">
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
            <h1 id="dm-reward-title">TARGET CLEARED</h1>
            <p>획득한 코인을 확인하고 직접 지갑에 수령하세요.</p>
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
            <strong>{run.coins + reward.total}¢</strong>
          </div>
        </div>

        <ol className="dm-reward__ledger" aria-label="라운드 보상 상세">
          {lines.map((line, index) => (
            <li
              className="dm-reward__line"
              data-zero={line.value === 0 || undefined}
              style={{ animationDelay: `${index * 75}ms` }}
              key={line.id}
            >
              <span className="dm-reward__line-icon" aria-hidden="true">{line.symbol}</span>
              <span className="dm-reward__line-copy">
                <b>{line.label}</b>
                <small>{line.description}</small>
              </span>
              <output aria-label={`${line.description} ${line.value}코인`}>
                +{line.value}¢
              </output>
            </li>
          ))}
        </ol>

        <section className="dm-reward__total" aria-label={`총 보상 ${reward.total}코인`}>
          <div>
            <span>TOTAL PAYOUT</span>
            <small>이번 라운드 총 획득</small>
          </div>
          <output>+{reward.total}¢</output>
        </section>

        <p className="dm-reward__notice" role="status" aria-live="polite">
          {notice || "보상은 수령 버튼을 누른 뒤 지갑에 반영됩니다."}
        </p>

        <button
          type="button"
          className="dm-reward__claim"
          disabled={claiming}
          aria-busy={claiming}
          onClick={onClaim}
        >
          <span>{claiming ? "코인 전송 중" : `+${reward.total}¢ 수령`}</span>
          <strong>{claiming ? "잠시만 기다려주세요" : `${destination} →`}</strong>
        </button>
      </section>
    </main>
  );
}
