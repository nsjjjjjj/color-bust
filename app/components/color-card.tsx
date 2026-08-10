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
  disabled = false,
  onClick,
}: {
  card: DisplayNumberCard;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`number-card card-${card.color}${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      aria-label={`${COLOR_LABELS[card.color]} ${card.value} 카드${selected ? ", 선택됨" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="card-corner top">{card.value}</span>
      <span className="card-number">{card.value}</span>
      <span className="card-pip" aria-hidden="true" />
      <span className="card-corner bottom">{card.value}</span>
    </button>
  );
}

