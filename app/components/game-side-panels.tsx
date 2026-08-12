"use client";

import type { ReactNode } from "react";

import { ROUND_ORDER, ROUND_REWARDS } from "../../lib/game/constants";
import { bossPenaltyFor } from "../../lib/game/boss-penalties";
import type { RunState } from "../../lib/game/types";

const ROUND_NAMES: Readonly<Record<RunState["round"], string>> = {
  small: "워밍업",
  big: "브레이크포인트",
  boss: "보스 · 메이헴",
};

const ROUND_RULES: Readonly<Record<RunState["round"], string>> = {
  small: "기본 목표 점수를 달성하세요.",
  big: "더 높은 목표 점수를 돌파하세요.",
  boss: "보스전 · 이번 STAGE의 마지막 관문입니다.",
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
  /** The resolved hand total while it is being deposited into round score. */
  transferScore?: number | null;
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
  transferScore = null,
  scorePhase = "idle",
  onOpenRunInfo,
  onOpenSettings,
  children,
}: GameLeftRailProps) {
  const visibleRoundScore = phase === "shop" ? 0 : displayRoundScore ?? run.score;
  const progress = run.target > 0 ? Math.min(100, (visibleRoundScore / run.target) * 100) : 0;
  const roundIndex = ROUND_ORDER.indexOf(run.round) + 1;
  const bossPenalty = bossPenaltyFor(run.ante, run.round);

  return (
    <aside
      className={`mobile-run-rail game-left-rail pixel-panel phase-${phase}${run.round === "boss" ? " is-boss" : ""}${isTransferring ? " is-transferring" : ""}`}
      data-score-phase={scorePhase}
      aria-label="현재 런과 라운드 정보"
    >
      <section className={`mobile-run-rail-round${phase === "shop" ? " is-garage" : ""}${phase === "reward" ? " is-clearing" : ""}`} aria-labelledby="mobile-run-rail-title" aria-hidden={phase === "reward" || undefined}>
        <header className="mobile-run-rail-blind">
          {phase !== "shop" ? (
            <span className="mobile-run-rail-blind-mark" aria-hidden="true">
              {run.round === "small" ? "S" : run.round === "big" ? "B" : "X"}
            </span>
          ) : null}
          <div className="mobile-run-rail-blind-copy">
            {phase !== "shop" ? <span>{`스테이지 ${run.ante}${run.mode === "standard" ? "/5" : "/∞"} · 라운드 ${roundIndex}/3`}</span> : null}
            <h2 id="mobile-run-rail-title">{phase === "shop" ? "GARAGE" : ROUND_NAMES[run.round]}</h2>
            {phase !== "shop" ? <small>{ROUND_RULES[run.round]}</small> : null}
          </div>
        </header>
        {phase !== "shop" && (
          <div className="mobile-run-rail-round-reward">
            <span>최소 득점</span>
            <strong>{run.target.toLocaleString()}</strong>
            <small>보상: <b>{"¢".repeat(ROUND_REWARDS[run.round])}</b></small>
          </div>
        )}
        {phase !== "shop" && bossPenalty ? (
          <div className="mobile-run-rail-boss-note" aria-label={`보스 패널티: ${bossPenalty.name}. ${bossPenalty.description}`}>
            <b>BOSS PENALTY</b>
            <strong>{bossPenalty.name}</strong>
            <span>{bossPenalty.description}</span>
          </div>
        ) : null}
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
        aria-label={handName ? `현재 족보: ${handName} 레벨 ${handLevel ?? 1}` : "현재 선택한 족보 없음"}
        data-score-pulse={scorePulse ?? undefined}
        data-score-event={scoreEventKey ?? undefined}
      >
        <span
          className="mobile-run-rail-hand-name"
          data-has-hand={handName ? "true" : undefined}
          data-score-transfer={isTransferring && transferScore !== null ? "true" : undefined}
        >
          {isTransferring && transferScore !== null
            ? <b className="mobile-run-rail-transfer-score">{transferScore.toLocaleString()}</b>
            : handName ? (
              <b>
                <span className="mobile-run-rail-hand-title">{handName}</span>
                <small className="mobile-run-rail-hand-level">Lv.{handLevel ?? 1}</small>
              </b>
            ) : null}
        </span>
        <div className="mobile-run-rail-equation">
          <div className="mobile-run-rail-chips">
            <strong><span className="mobile-run-rail-score-value" key={scorePulse === "power" || scorePulse === "both" ? `power-${scoreEventKey}` : "power-static"}>{power.toLocaleString()}</span></strong>
          </div>
          <b className="mobile-run-rail-equation-sign" aria-hidden="true">×</b>
          <div className="mobile-run-rail-mult">
            <strong><span className="mobile-run-rail-score-value" key={scorePulse === "hype" || scorePulse === "both" ? `hype-${scoreEventKey}` : "hype-static"}>{hype.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></strong>
          </div>
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
              <dd>
                <b>{run.ante}</b>
                <small>/{run.mode === "standard" ? 5 : "∞"}</small>
              </dd>
            </div>
            <div>
              <dt>ROUND</dt>
              <dd>{roundIndex}</dd>
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
