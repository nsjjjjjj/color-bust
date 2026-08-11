"use client";

import type { ReactNode } from "react";

import { ROUND_ORDER, ROUND_REWARDS } from "../../lib/game/constants";
import type { ScoreEvent } from "../../lib/game/score-events";
import type { RunState, ScoreBreakdown } from "../../lib/game/types";

const ROUND_LABELS: Readonly<Record<RunState["round"], string>> = {
  small: "첫 번째 TARGET",
  big: "두 번째 TARGET",
  boss: "스테이지 최종 TARGET",
};

const ROUND_NAMES: Readonly<Record<RunState["round"], string>> = {
  small: "WARM-UP",
  big: "BREAKPOINT",
  boss: "MAYHEM ROUND",
};

const ROUND_RULES: Readonly<Record<RunState["round"], string>> = {
  small: "덱의 흐름을 확인하며 목표 점수를 넘기세요.",
  big: "더 높은 목표 점수로 현재 빌드를 검증합니다.",
  boss: "STAGE의 마지막 관문입니다. 강화된 목표를 넘기세요.",
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
  transferRemainingScore?: number;
  isResolving?: boolean;
  isTransferring?: boolean;
  scorePhase?: "idle" | "selecting" | "moving" | "scoring" | "transferring" | "discarding" | "direct-discard";
  previewHandName?: string | null;
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
  transferRemainingScore,
  isResolving = false,
  isTransferring = false,
  scorePhase = "idle",
  previewHandName = null,
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
  const isSelecting = Boolean(previewHandName) && !isResolving;
  const canShowResult = !isSelecting && (isResolving || showingLastHand);
  const visibleBreakdown = canShowResult ? breakdown : null;
  const resolvedChips = visibleBreakdown
    ? visibleBreakdown.chipsBeforeUno + (visibleBreakdown.uno?.chipDelta ?? 0)
    : 0;
  const resolvedMultiplier = visibleBreakdown
    ? (visibleBreakdown.multiplierBeforeUno + (visibleBreakdown.uno?.multiplierDelta ?? 0))
      * visibleBreakdown.jokerXMultiplier
      * (visibleBreakdown.uno?.xMultiplier ?? 1)
    : 0;
  const calculationStarted = isResolving
    ? Boolean(scoreEvent) && scoreEvent?.type !== "hand-detected"
    : Boolean(visibleBreakdown);
  const chips = isResolving ? scoreEvent?.currentChips ?? 0 : resolvedChips;
  const multiplier = isResolving
    ? (scoreEvent?.currentMultiplier ?? 0) * (scoreEvent?.currentXMultiplier ?? 1)
    : resolvedMultiplier;
  const finalScoreRevealed = !isSelecting && (
    showingLastHand
    || scoreEvent?.type === "final-score"
    || scorePhase === "transferring"
    || scorePhase === "discarding"
  );
  const visibleHandScore = isTransferring
    ? transferRemainingScore ?? visibleBreakdown?.total ?? 0
    : scorePhase === "discarding"
      ? 0
      : visibleBreakdown?.total ?? 0;
  const handNameLabel = isSelecting
    ? "선택한 패턴"
    : isResolving
      ? "현재 계산"
      : showingLastHand
        ? "지난 핸드"
        : "핸드 결과";
  const handName = isSelecting
    ? previewHandName
    : visibleBreakdown
      ? `${visibleBreakdown.handName} · 레벨 ${visibleBreakdown.handLevel}`
      : "카드를 선택해 패턴을 만드세요";
  const totalLabel = isSelecting
    ? "점수는 제출 후 공개"
    : isTransferring
      ? "라운드 점수로 이동"
      : scorePhase === "discarding"
        ? "반영 완료"
        : showingLastHand
          ? "지난 점수"
          : "제출 후 공개";
  const previewAnnouncement = isSelecting
    ? `선택한 패턴은 ${previewHandName}입니다. 점수는 제출 후 공개됩니다.`
    : scorePhase === "transferring"
      ? `${visibleBreakdown?.total.toLocaleString() ?? 0}점을 라운드 점수에 반영합니다.`
      : scorePhase === "discarding"
        ? `${visibleBreakdown?.total.toLocaleString() ?? 0}점 반영을 완료했습니다.`
        : scoreEvent?.type === "final-score"
          ? `제출 점수 ${visibleBreakdown?.total.toLocaleString() ?? 0}점이 확정되었습니다.`
          : "";

  return (
    <aside
      className={`mobile-run-rail game-left-rail pixel-panel${run.round === "boss" ? " is-boss" : ""}${isResolving ? " is-resolving" : ""}${isTransferring ? " is-transferring" : ""}`}
      data-score-phase={scorePhase}
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

      <section className={`mobile-run-rail-score${isTransferring ? " is-receiving" : ""}`} aria-label="현재 라운드 점수" data-score-receiving={isTransferring || undefined}>
        <div className="mobile-run-rail-current">
          <span>라운드 점수</span>
          <strong>{visibleRoundScore.toLocaleString()}</strong>
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

      <section className="mobile-run-rail-preview" aria-label="선택 또는 제출한 핸드 결과" data-score-visibility={isSelecting ? "hand-only" : isTransferring ? "transferring" : finalScoreRevealed ? "settled" : "calculation"}>
        <strong className="mobile-run-rail-hand-name">
          <small>{handNameLabel}</small>
          {handName}
        </strong>
        <div className="mobile-run-rail-equation">
          <div className="mobile-run-rail-chips">
            <span>POWER</span>
            <strong key={`${scoreEvent?.id ?? "result"}-chips`}>{calculationStarted ? chips.toLocaleString() : "—"}</strong>
          </div>
          <b className="mobile-run-rail-equation-sign" aria-hidden="true">×</b>
          <div className="mobile-run-rail-mult">
            <span>HYPE</span>
            <strong key={`${scoreEvent?.id ?? "result"}-mult`}>{calculationStarted ? formatMultiplier(multiplier) : "—"}</strong>
          </div>
        </div>
        <output className={`mobile-run-rail-preview-total${isTransferring ? " is-transferring" : ""}`}>
          <span>{totalLabel}</span>
          <strong>{finalScoreRevealed ? visibleHandScore.toLocaleString() : "—"}</strong>
        </output>
        <span className="dm-sr-only" role="status" aria-live="polite">{previewAnnouncement}</span>
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
            <button type="button" className="rail-tool-mini" onClick={onOpenHandGuide} aria-label="패턴 보기">
              <span aria-hidden="true">♠</span><b>패턴</b><kbd>H</kbd>
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
              <dt>STAGE</dt>
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
