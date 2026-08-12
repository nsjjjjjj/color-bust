"use client";

import { useEffect, useRef, type ReactNode } from "react";

import type { GameCard, RunState } from "../../lib/game/types";
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
  readonly isTransferring?: boolean;
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
  notice = "",
  displayRoundScore,
  power = 0,
  hype = 0,
  handName = null,
  handLevel = null,
  scorePulse = null,
  scoreEventKey = null,
  scoreImpactKey = null,
  isTransferring = false,
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

  useEffect(() => {
    if (!scoreImpactKey || !screenRef.current) return;
    const screen = screenRef.current;
    screen.classList.remove("is-score-impact");
    void screen.offsetWidth;
    screen.classList.add("is-score-impact");
    return () => screen.classList.remove("is-score-impact");
  }, [scoreImpactKey]);

  return (
    <main
      ref={screenRef}
      className={`game-view balatro-mobile-game deck-game-view deck-run-view deck-run-view-${phase}${phase === "shop" ? " deck-run-view-playing" : ""}${className ? ` ${className}` : ""}`}
      data-run-phase={phase}
      data-score-phase={scorePhase}
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
          scorePhase={scorePhase}
          onOpenRunInfo={onOpenRunInfo}
          onOpenSettings={onOpenSettings}
        >
          {sidebarExtra}
        </GameLeftRail>

        <section className="felt-table play-felt deck-play-table" aria-label={`${PHASE_LABEL[phase]} 카드 테이블`}>
          <div className="felt-watermark" aria-hidden="true"><i /><i /><i /><i /></div>
          <header className="deck-stage-header">
            <div><span>{PHASE_LABEL[phase]}</span><strong>DECK MAYHEM</strong></div>
            <div className="deck-stage-status">
              <p role="status" aria-live="polite">{notice || (phase === "playing" ? "카드를 선택해 조합을 만드세요" : phase === "reward" ? "보상 명세를 확인하세요" : "필요한 카드를 골라 런을 정비하세요")}</p>
              {run.mode === "endless" && <strong className="deck-mode-badge"><i aria-hidden="true">∞</i> 무제한</strong>}
            </div>
          </header>

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
              disabled={deckDisabled}
            />
          </aside>
        </section>
      </div>
    </main>
  );
}
