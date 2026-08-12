"use client";

import { useMemo, useState } from "react";

import { COLOR_LABELS } from "../../lib/game/colors";
import type { CardColor, GameCard } from "../../lib/game/types";
import { ColorCard } from "./color-card";

export type DeckCardSort = "number" | "color";
export type DeckCardFilter = "all" | CardColor;

const COLOR_ORDER: readonly CardColor[] = ["red", "yellow", "green", "blue"];

export function sortDeckCards(
  cards: readonly GameCard[],
  sort: DeckCardSort,
): readonly GameCard[] {
  return [...cards].sort((left, right) => {
    if (sort === "color") {
      return COLOR_ORDER.indexOf(left.color) - COLOR_ORDER.indexOf(right.color)
        || right.rank - left.rank
        || left.id.localeCompare(right.id);
    }
    return right.rank - left.rank
      || COLOR_ORDER.indexOf(left.color) - COLOR_ORDER.indexOf(right.color)
      || left.id.localeCompare(right.id);
  });
}

export interface DeckCardGridProps {
  readonly cards: readonly GameCard[];
  readonly ariaLabel: string;
  readonly selectedId?: string | null;
  readonly selectedIds?: readonly string[];
  readonly onSelect?: (card: GameCard) => void;
  readonly disabledReason?: (card: GameCard) => string | null;
  readonly showFilters?: boolean;
  readonly emptyLabel?: string;
}

export function DeckCardGrid({
  cards,
  ariaLabel,
  selectedId = null,
  selectedIds = [],
  onSelect,
  disabledReason,
  showFilters = true,
  emptyLabel = "표시할 카드가 없습니다.",
}: DeckCardGridProps) {
  const [sort, setSort] = useState<DeckCardSort>("number");
  const [filter, setFilter] = useState<DeckCardFilter>("all");
  const visibleCards = useMemo(() => {
    const filtered = filter === "all"
      ? cards
      : cards.filter((card) => card.color === filter);
    return sortDeckCards(filtered, sort);
  }, [cards, filter, sort]);

  return (
    <section className="dm-card-browser" aria-label={ariaLabel}>
      <header className="dm-card-browser__toolbar">
        <div className="dm-card-browser__sort" role="group" aria-label="카드 정렬">
          <span>SORT</span>
          <button type="button" aria-pressed={sort === "number"} onClick={() => setSort("number")}>숫자 ↓</button>
          <button type="button" aria-pressed={sort === "color"} onClick={() => setSort("color")}>색상</button>
        </div>
        {showFilters && (
          <div className="dm-card-browser__filters" role="group" aria-label="색상 필터">
            <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>전체</button>
            {COLOR_ORDER.map((color) => (
              <button
                type="button"
                className={`is-${color}`}
                aria-pressed={filter === color}
                key={color}
                onClick={() => setFilter(color)}
              >
                {COLOR_LABELS[color]}
              </button>
            ))}
          </div>
        )}
        <strong>{visibleCards.length} / {cards.length}</strong>
      </header>

      <div className="dm-card-browser__grid">
        {visibleCards.map((card) => {
          const reason = disabledReason?.(card) ?? null;
          const selected = selectedId === card.id || selectedIds.includes(card.id);
          return (
            <div
              className="dm-card-browser__item"
              data-color={card.color}
              data-selected={selected || undefined}
              data-disabled={Boolean(reason) || undefined}
              title={reason ?? `${COLOR_LABELS[card.color]} ${card.rank}`}
              key={card.id}
            >
              <ColorCard
                card={{ ...card, value: card.rank }}
                selected={selected}
                disabled={Boolean(reason)}
                displayOnly={!onSelect}
                onClick={onSelect ? () => onSelect(card) : undefined}
              />
              {reason && <small className="dm-card-browser__reason">{reason}</small>}
            </div>
          );
        })}
        {visibleCards.length === 0 && <p className="dm-card-browser__empty">{emptyLabel}</p>}
      </div>
    </section>
  );
}
