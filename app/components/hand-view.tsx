"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { rankChipValue } from "../../lib/game/constants";
import type { ScoreEvent } from "../../lib/game/score-events";
import type { GameCard, ScoreBreakdown } from "../../lib/game/types";
import { handLayoutManager, type HandLayoutVariant } from "../../lib/ui/hand-layout";
import { ColorCard } from "./color-card";

function useMeasuredWidth() {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const measure = () => setWidth(Math.max(1, element.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { elementRef, width };
}

function layoutStyle(
  cardCount: number,
  availableWidth: number,
  variant: HandLayoutVariant,
) {
  const fallbackWidth = Math.max(320, Math.min(1040, cardCount * 132));
  const layout = handLayoutManager.calculate({
    cardCount,
    availableWidth: availableWidth || fallbackWidth,
    variant,
  });
  return {
    layout,
    style: {
      ...handLayoutManager.containerVariables(layout),
      height: `${layout.height}px`,
    } as CSSProperties,
  };
}

function shortcutFor(index: number): number | undefined {
  if (index < 9) return index + 1;
  if (index === 9) return 0;
  return undefined;
}

export function HandView({
  cards,
  selectedIds,
  scoringIds,
  resolving,
  onToggleCard,
}: {
  cards: readonly GameCard[];
  selectedIds: readonly string[];
  scoringIds: ReadonlySet<string>;
  resolving: boolean;
  onToggleCard: (id: string) => void;
}) {
  const { elementRef, width } = useMeasuredWidth();
  const { layout, style } = useMemo(
    () => layoutStyle(cards.length, width, "hand"),
    [cards.length, width],
  );

  return (
    <div
      className="hand-zone mobile-table-hand deck-hand-layout"
      ref={elementRef}
      style={style}
      data-card-count={cards.length}
    >
      {cards.map((card, index) => {
        const selected = selectedIds.includes(card.id);
        const slot = layout.cards[index];
        if (!slot) return null;
        const cardStyle = handLayoutManager.cardVariables(slot) as CSSProperties;

        return (
          <div
            className="deck-hand-card"
            data-selected={selected || undefined}
            key={card.id}
            style={cardStyle}
          >
            <ColorCard
              card={{ ...card, value: card.rank }}
              selected={selected}
              selectionOrder={selected ? selectedIds.indexOf(card.id) + 1 : undefined}
              shortcut={shortcutFor(index)}
              chipValue={rankChipValue(card.rank)}
              scoring={selected ? scoringIds.has(card.id) : undefined}
              disabled={resolving || (!selected && selectedIds.length >= 5)}
              onClick={() => onToggleCard(card.id)}
            />
          </div>
        );
      })}
    </div>
  );
}

function cardFeedback(event: ScoreEvent | null): string | null {
  if (!event?.sourceCardId || event.value === undefined) return null;
  return `${event.value >= 0 ? "+" : ""}${event.value}`;
}

export function PlayedCardsView({
  cards,
  breakdown,
  scoreEvent,
}: {
  cards: readonly GameCard[];
  breakdown: ScoreBreakdown;
  scoreEvent: ScoreEvent | null;
}) {
  const { elementRef, width } = useMeasuredWidth();
  const { layout, style } = useMemo(
    () => layoutStyle(cards.length, width, "played"),
    [cards.length, width],
  );
  const feedback = cardFeedback(scoreEvent);

  return (
    <div className="deck-resolve-cards deck-played-layout" ref={elementRef} style={style}>
      {cards.map((card, index) => {
        const isSource = scoreEvent?.sourceCardId === card.id;
        const slot = layout.cards[index];
        if (!slot) return null;
        const presentation = handLayoutManager.presentation(slot, { scoring: isSource });
        const cardStyle = {
          ...handLayoutManager.cardVariables(slot),
          ...handLayoutManager.presentationVariables(presentation),
        } as CSSProperties;

        return (
          <div
            className={`deck-resolve-card deck-played-card${isSource ? " is-source" : ""}`}
            data-scoring={isSource || undefined}
            style={cardStyle}
            key={card.id}
          >
            <ColorCard
              card={{ ...card, value: card.rank }}
              chipValue={rankChipValue(card.rank)}
              scoring={breakdown.scoringCardIds.includes(card.id)}
              resolving={isSource}
              displayOnly
            />
            {isSource && feedback && (
              <output className="deck-card-score-popup" key={scoreEvent.id}>
                {feedback}
                <small>CHIPS</small>
              </output>
            )}
          </div>
        );
      })}
    </div>
  );
}
