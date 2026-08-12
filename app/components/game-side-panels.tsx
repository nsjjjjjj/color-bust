"use client";

import type { ReactNode } from "react";

import { ROUND_ORDER, ROUND_REWARDS } from "../../lib/game/constants";
import type { RunState } from "../../lib/game/types";

const ROUND_NAMES: Readonly<Record<RunState["round"], string>> = {
  small: "워밍업",
  big: "브레이크포인트",
  boss: "메이헴 라운드",
};

const ROUND_RULES: Readonly<Record<RunState["round"], string>> = {
  small: "기본 목표 점수를 달성하세요.",
  big: "더 높은 목표 점수를 돌파하세요.",
  boss: "스테이지 마지막 목표입니다.",
};

export interface GameLeftRailProps {
  run: RunState;
  phase?: "playing" | "reward" | "shop";
  displayRoundScore?: number;
  power?: number;
  hype?: number;
  handName?: string | null;
  handLevel?: number | null;
  scorePulse?: "power" | "hype" | "both" | null;
  scoreEventKey?: string | null;
  isTransferring?: boolean;
  scorePhase?: "idle" | "selecting" | "moving" | "scoring" | "transferring" | "discarding" | "direct-discard";
  onOpenRunInfo: () => void;
  onOpenSettings: () => void;
  /** Optional in-run control, such as the Hot Swap color picker. */
  children?: ReactNode;
}

export function GameLeftRail({
  run,
  phase = "playing",
  displayRoundScore,
  power = 0,
  hype = 0,
  handName = null,
  handLevel = null,
  scorePulse = null,
  scoreEventKey = null,
  isTransferring = false,
  scorePhase = "idle",
  onOpenRunInfo,
  onOpenSettings,
  children,
}: GameLeftRailProps) {
  const visibleRoundScore = phase === "shop" ? 0 : displayRoundScore ?? run.score;
  const progress = run.target > 0 ? Math.min(100, (visibleRoundScore / run.target) * 100) : 0;
  const roundIndex = ROUND_ORDER.indexOf(run.round) + 1;

  return (
    <aside
      className={`mobile-run-rail game-left-rail pixel-panel${run.round === "boss" ? " is-boss" : ""}${isTransferring ? " is-transferring" : ""}`}
      data-score-phase={scorePhase}
      aria-label="현재 런과 라운드 정보"
    >
      <section className={`mobile-run-rail-round${phase === "shop" ? " is-garage" : ""}`} aria-labelledby="mobile-run-rail-title">
        <header className="mobile-run-rail-blind">
          <span className="mobile-run-rail-blind-mark" aria-hidden="true">
            {phase === "shop" ? "G" : run.round === "small" ? "S" : run.round === "big" ? "B" : "X"}
          </span>
          <div className="mobile-run-rail-blind-copy">
            <span>{phase === "shop" ? "DECK MAYHEM" : `스테이지 ${run.ante}${run.mode === "standard" ? "/5" : "/∞"} · 라운드 ${roundIndex}/3`}</span>
            <h2 id="mobile-run-rail-title">{phase === "shop" ? "GARAGE" : ROUND_NAMES[run.round]}</h2>
            <small>{phase === "shop" ? "카드를 골라 런 회로를 개조하세요." : ROUND_RULES[run.round]}</small>
          </div>
        </header>
        {phase !== "shop" && (
          <div className="mobile-run-rail-round-reward">
            <span>목표 점수</span>
            <strong>{run.target.toLocaleString()}</strong>
            <small>보상 +{ROUND_REWARDS[run.round]}¢</small>
          </div>
        )}
      </section>

      <section
        className={`mobile-run-rail-score${isTransferring ? " is-receiving" : ""}`}
        aria-label="현재 라운드 점수"
        data-score-receiving={isTransferring || undefined}
      >
          <div className="mobile-run-rail-scoreboard">
          <div className="mobile-run-rail-current">
            <span>라운드<br />점수</span>
            <strong>{visibleRoundScore.toLocaleString()}</strong>
          </div>
        </div>
        <progress
          className="mobile-run-rail-progress"
          max={100}
          value={progress}
          aria-label={`목표 점수 진행률 ${Math.floor(progress)}%`}
        >
          {Math.floor(progress)}%
        </progress>
        <small className="mobile-run-rail-score-target">
          {Math.floor(progress)}% · {Math.max(0, run.target - visibleRoundScore).toLocaleString()}점 남음
        </small>
      </section>

      <section
        className="mobile-run-rail-preview"
        aria-label={`${handName ? `${handName} 레벨 ${handLevel ?? 1}, ` : ""}현재 POWER ${power} 곱하기 HYPE ${hype}`}
        data-score-pulse={scorePulse ?? undefined}
        data-score-event={scoreEventKey ?? undefined}
      >
        <span className="mobile-run-rail-hand-name" data-has-hand={handName ? "true" : undefined}>
          {handName ? <b>{handName} Lv.{handLevel ?? 1}</b> : null}
        </span>
        <div className="mobile-run-rail-equation">
          <div className="mobile-run-rail-chips" key={scorePulse === "power" || scorePulse === "both" ? `power-${scoreEventKey}` : "power-static"}><span>POWER</span><strong>{power.toLocaleString()}</strong></div>
          <b className="mobile-run-rail-equation-sign" aria-hidden="true">×</b>
          <div className="mobile-run-rail-mult" key={scorePulse === "hype" || scorePulse === "both" ? `hype-${scoreEventKey}` : "hype-static"}><span>HYPE</span><strong>{hype.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
        </div>
      </section>

      {children && (
        <section className="mobile-run-rail-hot-swap" aria-labelledby="mobile-run-rail-hot-swap-title">
          <h3 id="mobile-run-rail-hot-swap-title">MOD 색상 설정</h3>
          {children}
        </section>
      )}

      <section className="mobile-run-rail-lower" aria-label="런 자원과 메뉴">
        <div className="mobile-run-rail-lower-stats">
          <dl className="mobile-run-rail-resources" aria-label="남은 게임 자원">
            <div className="mobile-run-resource mobile-run-resource-hands">
              <dt>핸드</dt>
              <dd>{run.handsLeft}</dd>
            </div>
            <div className="mobile-run-resource mobile-run-resource-discards">
              <dt>버리기</dt>
              <dd>{run.discardsLeft}</dd>
            </div>
          </dl>

          <section className="mobile-run-rail-wallet" aria-label="보유 코인">
            <strong>{run.coins}¢</strong>
          </section>

          <dl className="mobile-run-rail-run-meta" aria-label="스테이지와 라운드 진행도">
            <div>
              <dt>STAGE</dt>
              <dd>{run.ante}{run.mode === "standard" ? "/5" : "/∞"}</dd>
            </div>
            <div>
              <dt>ROUND</dt>
              <dd>{run.roundNumber}{run.mode === "standard" ? "/15" : ""}</dd>
            </div>
          </dl>
        </div>

        <div className="mobile-run-rail-lower-actions">
          <nav className="mobile-run-rail-tools mobile-run-rail-run-info" aria-label="런 정보">
            <button type="button" className="rail-tool-primary" onClick={onOpenRunInfo}>
              <span aria-hidden="true">▤</span><b>런<br />정보</b>
            </button>
          </nav>
          <nav className="mobile-run-rail-tools mobile-run-rail-options" aria-label="옵션">
            <button type="button" className="rail-tool-primary" onClick={onOpenSettings}>
              <span aria-hidden="true">⚙</span><b>옵션</b>
            </button>
          </nav>
        </div>
      </section>
    </aside>
  );
}
