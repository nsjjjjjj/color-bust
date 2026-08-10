"use client";

import type { ReactNode } from "react";

import { ROUND_ORDER } from "../../lib/game/constants";
import type { ScoreEvent } from "../../lib/game/score-events";
import type { RunState, ScoreBreakdown } from "../../lib/game/types";

const ROUND_LABELS: Readonly<Record<RunState["round"], string>> = {
  small: "SMALL BLIND",
  big: "BIG BLIND",
  boss: "BOSS BLIND",
};

const ROUND_NAMES: Readonly<Record<RunState["round"], string>> = {
  small: "스몰 블라인드",
  big: "빅 블라인드",
  boss: "보스 블라인드",
};

export interface GameLeftRailProps {
  run: RunState;
  breakdown?: ScoreBreakdown | null;
  scoreEvent?: ScoreEvent | null;
  displayRoundScore?: number;
  isResolving?: boolean;
  onOpenHandGuide: () => void;
  onOpenDeckInspector: () => void;
  onOpenShortcutGuide: () => void;
  onOpenLobby: () => void;
  onOpenSettings: () => void;
  /** Optional in-run control, such as the Hot Swap color picker. */
  children?: ReactNode;
}

export function GameLeftRail({
  run,
  breakdown,
  scoreEvent,
  displayRoundScore,
  isResolving = false,
  onOpenHandGuide,
  onOpenDeckInspector,
  onOpenShortcutGuide,
  onOpenLobby,
  onOpenSettings,
  children,
}: GameLeftRailProps) {
  const visibleRoundScore = displayRoundScore ?? run.score;
  const progress = run.target > 0 ? Math.min(100, (visibleRoundScore / run.target) * 100) : 0;
  const roundIndex = ROUND_ORDER.indexOf(run.round) + 1;
  const chips = breakdown?.chipsBeforeUno ?? 0;
  const multiplier = breakdown?.multiplierBeforeUno ?? 0;
  const previewScore = isResolving ? scoreEvent?.currentTotal ?? 0 : breakdown?.total ?? 0;

  return (
    <aside
      className={`mobile-run-rail game-left-rail pixel-panel${run.round === "boss" ? " is-boss" : ""}${isResolving ? " is-resolving" : ""}`}
      aria-label="현재 라운드 정보와 게임 도구"
    >
      <header className="mobile-run-rail-blind" aria-labelledby="mobile-run-rail-title">
        <div className="mobile-run-rail-ante">
          <span>ANTE</span>
          <strong>{run.ante}{run.mode === "standard" ? "/5" : "∞"}</strong>
        </div>
        <div className="mobile-run-rail-blind-copy">
          <span>{ROUND_NAMES[run.round]} · {roundIndex}/3</span>
          <h2 id="mobile-run-rail-title">{ROUND_LABELS[run.round]}</h2>
        </div>
      </header>

      <section className="mobile-run-rail-score" aria-label="라운드 점수">
        <div className="mobile-run-rail-target">
          <span>목표 점수</span>
          <strong><i aria-hidden="true">✦</i>{run.target.toLocaleString()}</strong>
        </div>
        <div className="mobile-run-rail-current">
          <span>라운드 점수</span>
          <strong>{visibleRoundScore.toLocaleString()}</strong>
        </div>
        <progress
          className="mobile-run-rail-progress"
          max={100}
          value={progress}
          aria-label={`목표 점수 진행률 ${Math.floor(progress)}%`}
        >
          {Math.floor(progress)}%
        </progress>
      </section>

      {run.round === "boss" && (
        <p className="mobile-run-rail-boss-note" role="note">
          <strong>BOSS</strong>
          <span>목표 점수가 높아지는 앤티의 마지막 관문</span>
        </p>
      )}

      <section className="mobile-run-rail-preview" aria-label="핸드 점수 미리보기" aria-live="polite">
        <strong className="mobile-run-rail-hand-name">
          {breakdown ? `${breakdown.handName} · Lv.${breakdown.handLevel}` : "NO HAND"}
        </strong>
        <div className="mobile-run-rail-equation">
          <div className="mobile-run-rail-chips">
            <span>CHIPS</span>
            <strong>{chips.toLocaleString()}</strong>
          </div>
          <b className="mobile-run-rail-equation-sign" aria-hidden="true">×</b>
          <div className="mobile-run-rail-mult">
            <span>MULT</span>
            <strong>{multiplier.toLocaleString()}</strong>
          </div>
        </div>
        <output className="mobile-run-rail-preview-total">
          <span>{isResolving ? "계산 중" : breakdown ? "예상 점수" : "미리보기"}</span>
          <strong>{previewScore.toLocaleString()}</strong>
        </output>
        {scoreEvent && (
          <div className={`mobile-run-rail-score-event event-${scoreEvent.emphasis}`} key={scoreEvent.id} aria-live="assertive">
            <span>{scoreEvent.label}</span>
            <b>{scoreEvent.description}</b>
          </div>
        )}
      </section>

      <dl className="mobile-run-rail-resources" aria-label="남은 게임 자원">
        <div>
          <dt>HANDS</dt>
          <dd>{run.handsLeft}</dd>
        </div>
        <div>
          <dt>DISCARDS</dt>
          <dd>{run.discardsLeft}</dd>
        </div>
        <div className="mobile-run-rail-coins">
          <dt>COINS</dt>
          <dd>{run.coins}¢</dd>
        </div>
      </dl>

      <nav className="mobile-run-rail-tools" aria-label="게임 참고 도구">
        <button type="button" onClick={onOpenLobby}>
          <span aria-hidden="true">⌂</span><b>로비</b>
        </button>
        <button type="button" onClick={onOpenSettings}>
          <span aria-hidden="true">⚙</span><b>옵션</b>
        </button>
        <button type="button" onClick={onOpenHandGuide}>
          <span aria-hidden="true">♠</span><b>족보</b><kbd>H</kbd>
        </button>
        <button type="button" onClick={onOpenDeckInspector}>
          <span aria-hidden="true">▤</span><b>덱</b><kbd>K</kbd>
        </button>
        <button type="button" onClick={onOpenShortcutGuide}>
          <span aria-hidden="true">?</span><b>도움말</b><kbd>?</kbd>
        </button>
      </nav>

      {children && (
        <section className="mobile-run-rail-hot-swap" aria-labelledby="mobile-run-rail-hot-swap-title">
          <h3 id="mobile-run-rail-hot-swap-title">HOT SWAP</h3>
          {children}
        </section>
      )}
    </aside>
  );
}
