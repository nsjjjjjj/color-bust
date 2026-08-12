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

const CHUNKY_ART_CHANNEL: Record<DisplayNumberCard["color"], string> = {
  red: "fire",
  yellow: "lightning",
  green: "leaf",
  blue: "water",
};

export function cardArtPath(card: Pick<DisplayNumberCard, "color" | "value">): string {
  return `/art/cards/chunky/${CHUNKY_ART_CHANNEL[card.color]}_${card.value}.png`;
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
      {/* Render the supplied source directly: no CSS-composited frame, crop,
          resize, or rebuilt card face. The 9:14 game slot uses contain. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="card-core-art"
        src={cardArtPath(card)}
        width={288}
        height={448}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
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
