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

export function HandView({
  cards,
  selectedIds,
  discardingIds = [],
  resolving,
  onToggleCard,
}: {
  cards: readonly GameCard[];
  selectedIds: readonly string[];
  discardingIds?: readonly string[];
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
      data-selection-state={selectedIds.length > 0 ? "selecting" : "idle"}
    >
      {cards.map((card, index) => {
        const selected = selectedIds.includes(card.id);
        const discarding = discardingIds.includes(card.id);
        const slot = layout.cards[index];
        if (!slot) return null;
        const cardStyle = handLayoutManager.cardVariables(slot) as CSSProperties;

        return (
          <div
            className="deck-hand-card"
            data-selected={selected || undefined}
            data-discarding={discarding || undefined}
            key={card.id}
            style={cardStyle}
            // Mark the existing DOM card before its selected state changes.
            // A later deselect can then settle it quietly instead of replaying
            // the initial draw animation.
            onClickCapture={(event) => {
              event.currentTarget.dataset.dealt = "true";
            }}
          >
            <ColorCard
              card={{ ...card, value: card.rank }}
              selected={selected}
              disabled={resolving || (!selected && selectedIds.length >= 5)}
              onClick={() => onToggleCard(card.id)}
            />
          </div>
        );
      })}
    </div>
  );
}

type CardFeedback = {
  readonly value: string;
  readonly unit: string;
  readonly kind: "card" | "enhancement" | "mod" | "mayhem";
};

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toLocaleString()}`;
}

function compactMultiplier(value: number): string {
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function cardHitKind(event: ScoreEvent | null): "card" | "enhancement" | "mod" | "mayhem" | undefined {
  if (!event?.sourceCardId) return undefined;
  return event.sourceKind === "mod"
    ? "mod"
    : event.sourceKind === "mayhem"
      ? "mayhem"
      : event.type === "card-effect" ? "enhancement" : "card";
}

function cardFeedback(event: ScoreEvent | null): CardFeedback | null {
  const kind = cardHitKind(event);
  if (!event || !kind) return null;

  const values: string[] = [];
  const units: string[] = [];
  if (event.value !== undefined && event.operation !== "set-score") {
    values.push(signed(event.value));
    units.push("POWER");
  }
  if (event.multiplierMode === "additive" && event.multiplier !== undefined) {
    values.push(signed(event.multiplier));
    units.push("HYPE");
  } else if (event.multiplierMode === "multiplicative" && event.multiplier !== undefined) {
    values.push(`×${compactMultiplier(event.multiplier)}`);
    units.push("MAYHEM");
  }
  if (event.reward !== undefined) {
    values.push(`${signed(event.reward)}¢`);
    units.push("MONEY");
  }
  if (values.length === 0) return null;

  return { value: values.join(" / "), unit: [...new Set(units)].join(" · "), kind };
}

export function PlayedCardsView({
  cards,
  breakdown,
  scoreEvents,
  scoreEvent,
  scoreEventIndex,
  playbackPhase,
}: {
  cards: readonly GameCard[];
  breakdown: ScoreBreakdown;
  scoreEvents: readonly ScoreEvent[];
  scoreEvent: ScoreEvent | null;
  scoreEventIndex: number;
  playbackPhase: "moving" | "scoring" | "transferring" | "discarding";
}) {
  const { elementRef, width } = useMeasuredWidth();
  const { layout, style } = useMemo(
    () => layoutStyle(cards.length, width, "played"),
    [cards.length, width],
  );
  const feedback = cardFeedback(scoreEvent);
  const cardScorePositions = useMemo(() => {
    const positions = new Map<string, {
      firstEventIndex: number;
      lastEventIndex: number;
      order: number;
    }>();
    let order = 0;
    scoreEvents.forEach((event, eventIndex) => {
      if (!event.sourceCardId) return;
      const existing = positions.get(event.sourceCardId);
      if (existing) {
        positions.set(event.sourceCardId, {
          ...existing,
          lastEventIndex: eventIndex,
        });
        return;
      }
      positions.set(event.sourceCardId, {
        firstEventIndex: eventIndex,
        lastEventIndex: eventIndex,
        order,
      });
      order += 1;
    });
    return positions;
  }, [scoreEvents]);

  return (
    <div
      className="deck-resolve-cards deck-played-layout"
      ref={elementRef}
      style={style}
      data-score-phase={playbackPhase}
      data-score-event-index={playbackPhase === "moving" ? undefined : scoreEventIndex}
    >
      {cards.map((card, index) => {
        const scorePosition = cardScorePositions.get(card.id);
        const isScoringCard = breakdown.scoringCardIds.includes(card.id)
          || Boolean(scorePosition);
        const cardScoreState = playbackPhase === "moving"
          ? "moving"
          : playbackPhase === "discarding"
            ? "discarding"
            : playbackPhase === "transferring"
              ? isScoringCard ? "scored" : "kicker"
            : !isScoringCard
              ? "kicker"
              : scoreEvent?.sourceCardId === card.id
                ? "active"
                : scorePosition && scorePosition.lastEventIndex < scoreEventIndex
                  ? "scored"
                  : "pending";
        const isSource = cardScoreState === "active";
        const hitKind = isSource ? feedback?.kind : undefined;
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
            data-card-score-state={cardScoreState}
            data-hit-kind={hitKind}
            data-source-kind={isSource ? scoreEvent?.sourceKind : undefined}
            data-score-order={scorePosition ? scorePosition.order + 1 : undefined}
            style={cardStyle}
            key={card.id}
          >
            <ColorCard
              card={{ ...card, value: card.rank }}
              chipValue={rankChipValue(card.rank)}
              scoring={isScoringCard}
              resolving={isSource}
              displayOnly
            />
            {isSource && feedback && (
              <output
                className={`deck-card-score-popup deck-card-score-popup-${feedback.kind}`}
                data-feedback-kind={feedback.kind}
                key={scoreEvent?.id ?? card.id}
              >
                {feedback.value}
                <small>{feedback.unit}</small>
              </output>
            )}
          </div>
        );
      })}
    </div>
  );
}
