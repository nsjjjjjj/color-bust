"use client";

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

export function ColorCard({
  card,
  selected = false,
  selectionOrder,
  shortcut,
  chipValue,
  scoring,
  disabled = false,
  onClick,
}: {
  card: DisplayNumberCard;
  selected?: boolean;
  selectionOrder?: number;
  shortcut?: number;
  chipValue?: number;
  scoring?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`number-card card-${card.color}${selected ? " is-selected" : ""}${scoring === true ? " is-scoring" : ""}${scoring === false ? " is-kicker" : ""}`}
      aria-pressed={selected}
      aria-label={`${COLOR_LABELS[card.color]} ${card.value} 카드${chipValue ? `, ${chipValue}칩` : ""}${selected ? `, ${selectionOrder ?? ""}번째로 선택됨` : ""}${scoring === false ? ", 족보 비기여 카드" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={`${COLOR_LABELS[card.color]} ${card.value} · ${chipValue ?? (card.value === 0 ? 10 : card.value + 1)} Chips`}
    >
      {shortcut && <kbd className="card-shortcut" aria-hidden="true">{shortcut}</kbd>}
      {selectionOrder && <span className="selection-order" aria-hidden="true">{selectionOrder}</span>}
      <span className="card-corner top">{card.value}</span>
      <span className="card-number">{card.value}</span>
      <span className="card-pip" aria-hidden="true" />
      <span className="card-corner bottom">{card.value}</span>
      {chipValue && <span className="card-chip-value" aria-hidden="true">{chipValue}c</span>}
    </button>
  );
}
