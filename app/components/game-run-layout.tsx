"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

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
      className={`game-view balatro-mobile-game deck-game-view deck-run-view deck-run-view-${phase}${phase === "playing" || phase === "shop" ? " deck-run-view-playing" : ""}${className ? ` ${className}` : ""}`}
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
          <div className="deck-stage-spacer" aria-hidden="true" />

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
