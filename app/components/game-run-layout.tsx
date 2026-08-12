"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { GameCard, RunState } from "../../lib/game/types";
import { bossPenaltyFor } from "../../lib/game/boss-penalties";
import { GameLeftRail, type GameLeftRailProps } from "./game-side-panels";
import { PileInspector } from "./pile-inspector";

export type RunLayoutPhase = "playing" | "reward" | "shop";

const PHASE_LABEL: Readonly<Record<RunLayoutPhase, string>> = {
  playing: "PLAY FIELD",
  reward: "CASH OUT",
  shop: "GARAGE",
};

export interface GameRunLayoutProps {
  readonly run: RunState;
  readonly phase: RunLayoutPhase;
  readonly notice?: string;
  readonly displayRoundScore?: number;
  readonly power?: number;
  readonly hype?: number;
  readonly handName?: string | null;
  readonly handLevel?: number | null;
  readonly scorePulse?: GameLeftRailProps["scorePulse"];
  readonly scoreEventKey?: string | null;
  /** A short full-table hit whenever the authoritative score increases. */
  readonly scoreImpactKey?: string | null;
  /** Later scoring cards receive a slightly stronger impact, matching pitch. */
  readonly scoreImpactStep?: number;
  readonly isTransferring?: boolean;
  readonly transferScore?: number | null;
  readonly scorePhase?: GameLeftRailProps["scorePhase"];
  readonly onOpenRunInfo: () => void;
  readonly onOpenSettings: () => void;
  readonly onOpenDeck: () => void;
  readonly drawPile?: readonly GameCard[];
  readonly referenceCards?: readonly GameCard[];
  readonly deckDisabled?: boolean;
  readonly sidebarExtra?: ReactNode;
  readonly topCardSlots: ReactNode;
  readonly children: ReactNode;
  readonly busy?: boolean;
  readonly className?: string;
}

export function GameRunLayout({
  run,
  phase,
  displayRoundScore,
  power = 0,
  hype = 0,
  handName = null,
  handLevel = null,
  scorePulse = null,
  scoreEventKey = null,
  scoreImpactKey = null,
  scoreImpactStep = 0,
  isTransferring = false,
  transferScore = null,
  scorePhase = "idle",
  onOpenRunInfo,
  onOpenSettings,
  onOpenDeck,
  drawPile = run.drawPile,
  referenceCards = run.deck ?? [...run.hand, ...run.drawPile, ...run.discardPile],
  deckDisabled = false,
  sidebarExtra,
  topCardSlots,
  children,
  busy = false,
  className = "",
}: GameRunLayoutProps) {
  const screenRef = useRef<HTMLElement>(null);
  const [isDeckPreviewOpen, setIsDeckPreviewOpen] = useState(false);
  const [showBossIntro, setShowBossIntro] = useState(false);
  const previousRoundRef = useRef(run.round);
  const isBossRound = phase === "playing" && run.round === "boss";
  const bossPenalty = bossPenaltyFor(run.ante, run.round);

  useEffect(() => {
    const enteredBossRound = run.round === "boss" && previousRoundRef.current !== "boss";
    previousRoundRef.current = run.round;
    if (!enteredBossRound) return;

    setShowBossIntro(true);
    const timer = window.setTimeout(() => setShowBossIntro(false), 1450);
    return () => window.clearTimeout(timer);
  }, [run.round]);

  useEffect(() => {
    if (!scoreImpactKey || !screenRef.current) return;
    const screen = screenRef.current;
    screen.classList.remove("is-score-impact");
    let animationFrame: number | null = null;
    let timer: number | null = null;

    const resetJiggle = () => {
      screen.style.removeProperty("--dm-score-offset-x");
      screen.style.removeProperty("--dm-score-offset-y");
      screen.style.removeProperty("--dm-score-rotation");
    };
    // Balatro-style room jiggle: a short impulse whose multi-axis waves decay
    // immediately, instead of a repeated left/right camera animation. The
    // score token is issued only after the browser starts the audio voice; a
    // nearly imperceptible follow-through makes the impact feel attached.
    timer = window.setTimeout(() => {
      screen.classList.add("is-score-impact");
      const startedAt = performance.now();
      const duration = 210;
      const strength = 1 + Math.min(4, scoreImpactStep) * .18;
      const animate = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const envelope = (1 - progress) ** 2;
        const elapsed = now - startedAt;
        const offsetX = (Math.sin(elapsed * .105) * 3.4 + Math.sin(elapsed * .041) * 1.1) * envelope * strength;
        const offsetY = (Math.sin(elapsed * .119 + .82) * 2.15 + Math.sin(elapsed * .052) * .7) * envelope * strength;
        const rotation = Math.sin(elapsed * .083 + .32) * .19 * envelope * strength;
        screen.style.setProperty("--dm-score-offset-x", `${offsetX.toFixed(2)}px`);
        screen.style.setProperty("--dm-score-offset-y", `${offsetY.toFixed(2)}px`);
        screen.style.setProperty("--dm-score-rotation", `${rotation.toFixed(3)}deg`);
        if (progress < 1) {
          animationFrame = window.requestAnimationFrame(animate);
          return;
        }
        resetJiggle();
        screen.classList.remove("is-score-impact");
      };
      animationFrame = window.requestAnimationFrame(animate);
    }, 12);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      resetJiggle();
      screen.classList.remove("is-score-impact");
    };
  }, [scoreImpactKey, scoreImpactStep]);

  return (
    <main
      ref={screenRef}
      className={`game-view balatro-mobile-game deck-game-view deck-run-view deck-run-view-${phase} deck-run-view-playing${isBossRound ? " is-boss-round" : ""}${className ? ` ${className}` : ""}`}
      data-run-phase={phase}
      data-score-phase={scorePhase}
      data-score-impact-step={Math.min(4, Math.max(0, scoreImpactStep))}
      aria-busy={busy}
    >
      <div className="rotate-hint" role="note"><span aria-hidden="true">↻</span> 가로 화면에서 카드 테이블을 더 넓게 볼 수 있어요.</div>
      <div className="mobile-game-shell deck-game-shell">
        <GameLeftRail
          run={run}
          phase={phase}
          displayRoundScore={displayRoundScore}
          power={power}
          hype={hype}
          handName={handName}
          handLevel={handLevel}
          scorePulse={scorePulse}
          scoreEventKey={scoreEventKey}
          isTransferring={isTransferring}
          transferScore={transferScore}
          scorePhase={scorePhase}
          onOpenRunInfo={onOpenRunInfo}
          onOpenSettings={onOpenSettings}
        >
          {sidebarExtra}
        </GameLeftRail>

        <section
          className={`felt-table play-felt deck-play-table${isDeckPreviewOpen ? " is-deck-preview-open" : ""}`}
          aria-label={`${PHASE_LABEL[phase]} 카드 테이블`}
        >
          <div className="felt-watermark" aria-hidden="true"><i /><i /><i /><i /></div>
          {/* Reserve the former title strip as deliberate breathing room.
              MOD and MAYHEM stay in their existing rack row below it. */}
          <div className="deck-stage-spacer" aria-hidden={!isBossRound}>
            {isBossRound ? (
              <div className="deck-boss-banner" role="status">
                <span>⚠ BOSS ROUND</span>
                <strong>MAYHEM ROUND</strong>
                <small>{bossPenalty?.name ?? "최종 관문"} · 목표 {run.target.toLocaleString()}점</small>
              </div>
            ) : null}
          </div>

          {showBossIntro && isBossRound ? (
            <div className="deck-boss-intro" role="status" aria-live="assertive">
              <span>WARNING</span><strong>BOSS<br />MAYHEM ROUND</strong><small>STAGE {run.ante} · FINAL GATE</small>
            </div>
          ) : null}

          {topCardSlots}

          <section className="deck-run-main-content" data-run-content={phase}>
            {children}
          </section>

          <aside className="deck-pile-dock" aria-label="뽑기 더미">
            <PileInspector
              variant="draw"
              cards={drawPile}
              referenceCards={referenceCards}
              totalCards={referenceCards.length}
              onOpenDetails={onOpenDeck}
              onPreviewChange={setIsDeckPreviewOpen}
              disabled={deckDisabled}
            />
          </aside>
        </section>
      </div>
    </main>
  );
}
