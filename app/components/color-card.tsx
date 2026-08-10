"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";

export type DisplayNumberCard = {
  id: string;
  color: "red" | "blue" | "green" | "yellow";
  value: number;
};

const COLOR_LABELS = {
  red: "빨강",
  blue: "파랑",
  green: "초록",
  yellow: "노랑",
} as const;

const COLOR_SUITS = {
  red: { label: "FLAME", korean: "불꽃" },
  yellow: { label: "SPARK", korean: "불티" },
  green: { label: "LEAF", korean: "잎사귀" },
  blue: { label: "DROP", korean: "물방울" },
} as const;

export function ColorCard({
  card,
  selected = false,
  selectionOrder,
  shortcut,
  chipValue,
  scoring,
  resolving = false,
  displayOnly = false,
  disabled = false,
  onClick,
}: {
  card: DisplayNumberCard;
  selected?: boolean;
  selectionOrder?: number;
  shortcut?: number;
  chipValue?: number;
  scoring?: boolean;
  resolving?: boolean;
  displayOnly?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const suppressNextClick = useRef(false);
  const tooltipId = useId();
  const suit = COLOR_SUITS[card.color];
  const resolvedChipValue = chipValue ?? (card.value === 0 ? 10 : card.value + 1);

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
    if (displayOnly || event.pointerType === "mouse") return;
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      suppressNextClick.current = true;
      setInfoOpen(true);
    }, 460);
  }

  return (
    <button
      type="button"
      className={`number-card card-${card.color}${selected ? " is-selected" : ""}${scoring === true ? " is-scoring" : ""}${scoring === false ? " is-kicker" : ""}${resolving ? " is-resolving" : ""}${infoOpen ? " is-info-open" : ""}${displayOnly ? " is-display-only" : ""}`}
      aria-pressed={selected}
      aria-label={`${suit.korean} ${COLOR_LABELS[card.color]} ${card.value} 카드, ${resolvedChipValue}칩${selected ? `, ${selectionOrder ?? ""}번째로 선택됨` : ""}${scoring === false ? ", 족보 비기여 카드" : ""}`}
      aria-describedby={tooltipId}
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
        if (displayOnly) return;
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
      {shortcut && <kbd className="card-shortcut" aria-hidden="true">{shortcut}</kbd>}
      {selectionOrder && <span className="selection-order" aria-hidden="true">{selectionOrder}</span>}
      <span className="card-corner top">{card.value}</span>
      <span className={`card-suit card-suit-${card.color}`} aria-hidden="true" />
      <span className="card-number">{card.value}</span>
      <span className="card-corner bottom">{card.value}</span>
      <span className="card-type-label" aria-hidden="true"><i className={`card-mini-suit card-mini-suit-${card.color}`} />{suit.label}</span>
      <span className="card-chip-value" aria-hidden="true">{resolvedChipValue}c</span>
      <span id={tooltipId} className="card-hover-info" role="tooltip">
        <b>{card.value} · {suit.label}</b>
        <small>{suit.korean} {COLOR_LABELS[card.color]} · {resolvedChipValue} Chips</small>
      </span>
    </button>
  );
}
