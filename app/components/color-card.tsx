"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";

import { COLOR_IDENTITIES } from "@/lib/game/colors";

export type DisplayNumberCard = {
  id: string;
  color: "red" | "blue" | "green" | "yellow";
  value: number;
  enhancement?: "charged" | "amplified" | "minted" | "overclocked";
};

const ENHANCEMENT_LABELS = {
  charged: "충전 · 득점 시 +18 POWER",
  amplified: "증폭 · 득점 시 +2 HYPE",
  minted: "민트 · 득점 시 +1¢",
  overclocked: "오버클럭 · 득점 시 +30 POWER, +3 HYPE",
} as const;

function ColorSigil({ color, corner }: {
  color: DisplayNumberCard["color"];
  corner: "top" | "bottom";
}) {
  // Deliberately made from square pixels, not smooth SVG paths: these are
  // the card color's tiny identity marks (grass / water / lightning / fire).
  const pixels = color === "red"
    // fire: tall tip, wide warm base
    ? [[7, 1], [6, 2], [7, 2], [8, 2], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [6, 8], [7, 8], [8, 8]]
    : color === "blue"
      // water: one pointed drop rather than a diamond badge
      ? [[7, 1], [6, 2], [7, 2], [8, 2], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [6, 7], [7, 7], [8, 7], [6, 8], [7, 8], [8, 8], [7, 9]]
      : color === "green"
        // grass: individual blades rooted in a low pixel line
        ? [[4, 3], [8, 3], [12, 3], [4, 4], [8, 4], [12, 4], [4, 5], [5, 5], [7, 5], [8, 5], [9, 5], [11, 5], [12, 5], [3, 6], [4, 6], [5, 6], [7, 6], [8, 6], [9, 6], [11, 6], [12, 6], [13, 6], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7], [12, 7], [13, 7]]
        // lightning: one sharply stepped strike
        : [[8, 1], [9, 1], [7, 2], [8, 2], [9, 2], [6, 3], [7, 3], [8, 3], [6, 4], [7, 4], [8, 4], [7, 5], [8, 5], [6, 6], [7, 6], [5, 7], [6, 7], [4, 8], [5, 8], [4, 9]];

  return (
    <span className={`card-color-sigil card-color-sigil-${corner}`} data-color={color} aria-hidden="true">
      <svg viewBox="0 0 16 12" focusable="false" shapeRendering="crispEdges">
        {pixels.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />)}
      </svg>
    </span>
  );
}

export function cardArtPath(card: Pick<DisplayNumberCard, "color" | "value">): string {
  return `/art/cards/core/${card.color}-${card.value}.png`;
}

export function ColorCard({
  card,
  selected = false,
  chipValue,
  scoring,
  resolving = false,
  displayOnly = false,
  revealScoreDetails,
  disabled = false,
  onClick,
}: {
  card: DisplayNumberCard;
  selected?: boolean;
  chipValue?: number;
  scoring?: boolean;
  resolving?: boolean;
  displayOnly?: boolean;
  /** Score contribution is hidden in the hand and revealed only after play. */
  revealScoreDetails?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const suppressNextClick = useRef(false);
  const tooltipId = useId();
  const colorIdentity = COLOR_IDENTITIES[card.color];
  const resolvedChipValue = chipValue ?? (card.value === 0 ? 10 : card.value + 1);
  const scoreDetailsVisible = revealScoreDetails ?? displayOnly;
  const enhancementLabel = card.enhancement
    ? ENHANCEMENT_LABELS[card.enhancement]
    : null;
  const hasHoverDetails = Boolean(enhancementLabel || scoreDetailsVisible);

  useEffect(() => () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
    }
  }, []);

  function clearLongPress() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!hasHoverDetails || displayOnly || event.pointerType === "mouse") return;
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      suppressNextClick.current = true;
      setInfoOpen(true);
    }, 460);
  }

  return (
    <button
      type="button"
      className={`number-card card-${card.color}${card.enhancement ? ` enhancement-${card.enhancement}` : ""}${selected ? " is-selected" : ""}${scoreDetailsVisible && scoring === true ? " is-scoring" : ""}${scoreDetailsVisible && scoring === false ? " is-kicker" : ""}${resolving ? " is-resolving" : ""}${infoOpen ? " is-info-open" : ""}${displayOnly ? " is-display-only" : ""}`}
      aria-pressed={selected}
      aria-label={`${colorIdentity.name} ${colorIdentity.koreanColor} ${card.value} 카드${enhancementLabel ? `, ${enhancementLabel}` : ""}${scoreDetailsVisible ? `, ${resolvedChipValue} 파워` : ""}${selected ? ", 선택됨" : ""}${scoreDetailsVisible && scoring === false ? ", 족보 비기여 카드" : ""}`}
      aria-describedby={hasHoverDetails ? tooltipId : undefined}
      disabled={disabled}
      tabIndex={displayOnly ? -1 : undefined}
      onPointerDown={handlePointerDown}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerLeave={() => {
        clearLongPress();
        if (!displayOnly) setInfoOpen(false);
      }}
      onBlur={() => setInfoOpen(false)}
      onContextMenu={(event) => {
        if (!hasHoverDetails || displayOnly) return;
        event.preventDefault();
        setInfoOpen(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setInfoOpen(false);
      }}
      onClick={() => {
        clearLongPress();
        if (suppressNextClick.current) {
          suppressNextClick.current = false;
          return;
        }
        setInfoOpen(false);
        onClick?.();
      }}
    >
      {/* Raw img preserves the approved 94×140 pixel crop and keeps it available
          in the generated offline shell without an image-optimizer request. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="card-core-art"
        src={cardArtPath(card)}
        width={94}
        height={140}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <ColorSigil color={card.color} corner="top" />
      <ColorSigil color={card.color} corner="bottom" />
      {card.enhancement && (
        <span className="card-enhancement-badge" aria-hidden="true">
          {card.enhancement === "charged" ? "P+" : card.enhancement === "amplified" ? "H+" : card.enhancement === "minted" ? "¢" : "OC"}
        </span>
      )}
      {hasHoverDetails && (
        <span id={tooltipId} className="card-hover-info" role="tooltip">
          <b>{card.value} · {colorIdentity.name}</b>
          <small>
            {colorIdentity.name} · {colorIdentity.koreanColor}
            {scoreDetailsVisible ? ` · ${resolvedChipValue} POWER` : ""}
            {enhancementLabel ? ` · ${enhancementLabel}` : ""}
          </small>
        </span>
      )}
    </button>
  );
}
