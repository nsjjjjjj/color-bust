"use client";

import type { ReactNode } from "react";

import { ROUND_ORDER, ROUND_REWARDS } from "../../lib/game/constants";
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

const ROUND_RULES: Readonly<Record<RunState["round"], string>> = {
  small: "덱의 흐름을 확인하며 목표 점수를 넘기세요.",
  big: "더 높은 목표 점수로 현재 빌드를 검증합니다.",
  boss: "앤티의 마지막 관문입니다. 강화된 목표를 넘기세요.",
};

const ROUND_DEBUFFS: Readonly<Record<RunState["round"], string>> = {
  small: "추가 디버프 없음",
  big: "추가 디버프 없음",
  boss: "추가 디버프 없음",
};

function formatMultiplier(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export interface GameLeftRailProps {
  run: RunState;
  breakdown?: ScoreBreakdown | null;
  scoreEvent?: ScoreEvent | null;
  displayRoundScore?: number;
  isResolving?: boolean;
  showingLastHand?: boolean;
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
  showingLastHand = false,
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
  const previewChips = breakdown
    ? breakdown.chipsBeforeUno + (breakdown.uno?.chipDelta ?? 0)
    : 0;
  const previewMultiplier = breakdown
    ? (breakdown.multiplierBeforeUno + (breakdown.uno?.multiplierDelta ?? 0))
      * breakdown.jokerXMultiplier
      * (breakdown.uno?.xMultiplier ?? 1)
    : 0;
  const chips = isResolving ? scoreEvent?.currentChips ?? 0 : previewChips;
  const multiplier = isResolving
    ? (scoreEvent?.currentMultiplier ?? 0) * (scoreEvent?.currentXMultiplier ?? 1)
    : previewMultiplier;
  const previewScore = isResolving ? scoreEvent?.currentTotal ?? 0 : breakdown?.total ?? 0;

  return (
    <aside
      className={`mobile-run-rail game-left-rail pixel-panel${run.round === "boss" ? " is-boss" : ""}${isResolving ? " is-resolving" : ""}`}
      aria-label="현재 라운드 정보와 게임 도구"
    >
      <section className="mobile-run-rail-round" aria-labelledby="mobile-run-rail-title">
        <header className="mobile-run-rail-blind">
          <span className="mobile-run-rail-blind-mark" aria-hidden="true">
            {run.round === "small" ? "S" : run.round === "big" ? "B" : "X"}
          </span>
          <div className="mobile-run-rail-blind-copy">
            <span>현재 라운드 · {ROUND_LABELS[run.round]}</span>
            <h2 id="mobile-run-rail-title">{ROUND_NAMES[run.round]}</h2>
            <div className="mobile-run-rail-round-effect">
              <b>현재 라운드 규칙</b>
              <strong>{ROUND_DEBUFFS[run.round]}</strong>
              <p>{ROUND_RULES[run.round]}</p>
            </div>
          </div>
        </header>
        <div className="mobile-run-rail-round-goal">
          <div>
            <span>목표 점수</span>
            <strong><i aria-hidden="true">✦</i>{run.target.toLocaleString()}</strong>
          </div>
          <div>
            <span>클리어 보상</span>
            <strong>{ROUND_REWARDS[run.round]}¢ <small>+ 남은 핸드</small></strong>
          </div>
        </div>
      </section>

      <section className="mobile-run-rail-score" aria-label="현재 라운드 점수">
        <div className="mobile-run-rail-current">
          <span>라운드 점수</span>
          <strong key={`round-score-${visibleRoundScore}`}>{visibleRoundScore.toLocaleString()}</strong>
          <small className="mobile-run-rail-score-target">
            목표 {run.target.toLocaleString()}
          </small>
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

      <section className="mobile-run-rail-preview" aria-label="핸드 점수 미리보기" aria-live="polite">
        <strong className="mobile-run-rail-hand-name">
          <small>{showingLastHand ? "지난 핸드" : "현재 핸드"}</small>
          {breakdown ? `${breakdown.handName} · 레벨 ${breakdown.handLevel}` : "선택된 핸드 없음"}
        </strong>
        <div className="mobile-run-rail-equation">
          <div className="mobile-run-rail-chips">
            <span>칩</span>
            <strong key={`${scoreEvent?.id ?? "preview"}-chips`}>{chips.toLocaleString()}</strong>
          </div>
          <b className="mobile-run-rail-equation-sign" aria-hidden="true">×</b>
          <div className="mobile-run-rail-mult">
            <span>배수</span>
            <strong key={`${scoreEvent?.id ?? "preview"}-mult`}>{formatMultiplier(multiplier)}</strong>
          </div>
        </div>
        <output className="mobile-run-rail-preview-total">
          <span>{isResolving ? "계산 중" : showingLastHand ? "지난 점수" : breakdown ? "예상 점수" : "미리보기"}</span>
          <strong>{previewScore.toLocaleString()}</strong>
        </output>
        {scoreEvent && (
          <div className={`mobile-run-rail-score-event event-${scoreEvent.emphasis}`} key={scoreEvent.id} aria-live="assertive">
            <span>{scoreEvent.label}</span>
            <b>{scoreEvent.description}</b>
          </div>
        )}
      </section>

      {children && (
        <section className="mobile-run-rail-hot-swap" aria-labelledby="mobile-run-rail-hot-swap-title">
          <h3 id="mobile-run-rail-hot-swap-title">색상 변경</h3>
          {children}
        </section>
      )}

      <section className="mobile-run-rail-lower" aria-label="런 자원과 메뉴">
        <div className="mobile-run-rail-lower-actions">
          <nav className="mobile-run-rail-tools mobile-run-rail-run-info" aria-label="런 정보">
            <button type="button" className="rail-tool-primary" onClick={onOpenDeckInspector}>
              <span aria-hidden="true">▤</span><b>런 정보</b><kbd>K</kbd>
            </button>
          </nav>
          <nav className="mobile-run-rail-tools mobile-run-rail-options" aria-label="옵션과 도움말">
            <button type="button" className="rail-tool-primary" onClick={onOpenSettings}>
              <span aria-hidden="true">⚙</span><b>옵션</b>
            </button>
            <button type="button" className="rail-tool-mini" onClick={onOpenLobby} aria-label="로비로 이동">
              <span aria-hidden="true">⌂</span><b>로비</b>
            </button>
            <button type="button" className="rail-tool-mini" onClick={onOpenHandGuide} aria-label="족보 보기">
              <span aria-hidden="true">♠</span><b>족보</b><kbd>H</kbd>
            </button>
            <button type="button" className="rail-tool-mini" onClick={onOpenShortcutGuide} aria-label="단축키 도움말">
              <span aria-hidden="true">?</span><b>도움말</b><kbd>?</kbd>
            </button>
          </nav>
        </div>

        <div className="mobile-run-rail-lower-stats">
          <dl className="mobile-run-rail-resources" aria-label="남은 게임 자원">
            <div>
              <dt>핸드</dt>
              <dd>{run.handsLeft}</dd>
            </div>
            <div>
              <dt>버리기</dt>
              <dd>{run.discardsLeft}</dd>
            </div>
          </dl>

          <section className="mobile-run-rail-wallet" aria-label="보유 코인">
            <span>보유 금액</span>
            <strong>{run.coins}¢</strong>
          </section>

          <dl className="mobile-run-rail-run-meta" aria-label="런 진행도">
            <div>
              <dt>앤티</dt>
              <dd>{run.ante}{run.mode === "standard" ? "/5" : "/∞"}</dd>
            </div>
            <div>
              <dt>라운드</dt>
              <dd>{roundIndex}/3 <small>· #{run.roundNumber}</small></dd>
            </div>
          </dl>
        </div>
      </section>
    </aside>
  );
}
