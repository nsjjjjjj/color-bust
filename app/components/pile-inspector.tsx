"use client";

import { useId, useMemo, useState, type FocusEvent } from "react";

import { COLOR_IDENTITIES } from "../../lib/game/colors";
import type { CardColor, CardRank, GameCard } from "../../lib/game/types";

export type PileInspectorVariant = "draw" | "discard";

export interface PileInspectorProps {
  /** Cards in engine order. The final item is treated as the top card. */
  readonly cards: readonly GameCard[];
  readonly variant: PileInspectorVariant;
  /** Opens the full DeckInspector dialog on click or tap. */
  readonly onOpenDetails: () => void;
  /** Retained for callers that need to clear any external deck-preview state. */
  readonly onPreviewChange?: (isOpen: boolean) => void;
  readonly className?: string;
  readonly disabled?: boolean;
  /** Garage keeps the pile as a fixed visual anchor; only play exposes hover details. */
  readonly previewEnabled?: boolean;
  /**
   * The real run deck used as the draw-preview baseline. Pass draw + discard +
   * hand so each color/rank slot can show current/total counts. Ignored by the
   * discard preview.
   */
  readonly referenceCards?: readonly GameCard[];
  /** Full run deck size, retained as a compact-counter fallback. */
  readonly totalCards?: number;
  /** Optional visible/accessible pile name override. */
  readonly label?: string;
}

export interface PileColorSummary {
  readonly color: CardColor;
  readonly count: number;
  readonly symbol: string;
  readonly symbolName: "Flame" | "Spark" | "Leaf" | "Drop";
  readonly koreanLabel: string;
  readonly colorLabel: string;
}

export interface PileSummary {
  readonly total: number;
  readonly byColor: Readonly<Record<CardColor, number>>;
  readonly byRank: Readonly<Record<CardRank, number>>;
  readonly colors: readonly PileColorSummary[];
  readonly topCard?: GameCard;
}

export type PileCardAvailability = "available" | "partial" | "depleted" | "absent";

export interface PileCardComparison {
  readonly color: CardColor;
  readonly rank: CardRank;
  readonly current: number;
  readonly total: number;
  readonly missing: number;
  readonly availability: PileCardAvailability;
}

export interface PileColorComparison extends PileColorSummary {
  readonly current: number;
  readonly total: number;
  readonly missing: number;
}

export interface PilePreviewGroup {
  readonly color: CardColor;
  readonly cards: readonly PileCardComparison[];
}

export interface PileComparison {
  readonly current: number;
  readonly total: number;
  readonly missing: number;
  readonly colors: readonly PileColorComparison[];
  readonly groups: readonly PilePreviewGroup[];
  /** Always 40 color/rank cells, independently of duplicate counts. */
  readonly slots: readonly PileCardComparison[];
}

export const PILE_COLOR_ACCESSIBILITY: Readonly<
  Record<
    CardColor,
    {
      readonly symbol: string;
      readonly symbolName: "Flame" | "Spark" | "Leaf" | "Drop";
      readonly koreanLabel: string;
      readonly colorLabel: string;
    }
  >
> = {
  red: {
    symbol: "▲",
    symbolName: "Flame",
    koreanLabel: COLOR_IDENTITIES.red.name,
    colorLabel: COLOR_IDENTITIES.red.koreanColor,
  },
  yellow: {
    symbol: "✦",
    symbolName: "Spark",
    koreanLabel: COLOR_IDENTITIES.yellow.name,
    colorLabel: COLOR_IDENTITIES.yellow.koreanColor,
  },
  green: {
    symbol: "◆",
    symbolName: "Leaf",
    koreanLabel: COLOR_IDENTITIES.green.name,
    colorLabel: COLOR_IDENTITIES.green.koreanColor,
  },
  blue: {
    symbol: "▼",
    symbolName: "Drop",
    koreanLabel: COLOR_IDENTITIES.blue.name,
    colorLabel: COLOR_IDENTITIES.blue.koreanColor,
  },
};

const COLOR_ORDER: readonly CardColor[] = ["red", "yellow", "green", "blue"];
const RANK_ORDER: readonly CardRank[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function summarizePile(cards: readonly GameCard[]): PileSummary {
  const byColor: Record<CardColor, number> = {
    red: 0,
    blue: 0,
    green: 0,
    yellow: 0,
  };
  const byRank = Object.fromEntries(
    RANK_ORDER.map((rank) => [rank, 0]),
  ) as Record<CardRank, number>;

  for (const card of cards) {
    byColor[card.color] += 1;
    byRank[card.rank] += 1;
  }

  return {
    total: cards.length,
    byColor,
    byRank,
    colors: COLOR_ORDER.map((color) => ({
      color,
      count: byColor[color],
      ...PILE_COLOR_ACCESSIBILITY[color],
    })),
    topCard: cards.length > 0 ? cards[cards.length - 1] : undefined,
  };
}

function cardCountKey(color: CardColor, rank: CardRank): string {
  return `${color}:${rank}`;
}

function countCards(cards: readonly GameCard[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const card of cards) {
    const key = cardCountKey(card.color, card.rank);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

/**
 * Compares a live pile with the real run deck in a bounded 4 × 10 matrix.
 * Duplicate cards are represented by counts rather than duplicate DOM nodes.
 */
export function comparePileToReference(
  currentCards: readonly GameCard[],
  referenceCards: readonly GameCard[] = currentCards,
): PileComparison {
  const currentCounts = countCards(currentCards);
  const referenceCounts = countCards(referenceCards);
  const slots = COLOR_ORDER.flatMap((color) =>
    RANK_ORDER.map((rank): PileCardComparison => {
      const current = currentCounts.get(cardCountKey(color, rank)) ?? 0;
      // A stale/incomplete reference must never claim fewer cards than the live pile.
      const total = Math.max(
        current,
        referenceCounts.get(cardCountKey(color, rank)) ?? 0,
      );
      const missing = Math.max(0, total - current);
      const availability: PileCardAvailability = total === 0
        ? "absent"
        : current === 0
          ? "depleted"
          : current < total
            ? "partial"
            : "available";

      return { color, rank, current, total, missing, availability };
    }),
  );
  const groups = COLOR_ORDER.map((color) => ({
    color,
    cards: slots.filter((slot) => slot.color === color),
  }));
  const colors = groups.map((group): PileColorComparison => {
    const current = group.cards.reduce((sum, card) => sum + card.current, 0);
    const total = group.cards.reduce((sum, card) => sum + card.total, 0);
    return {
      color: group.color,
      count: current,
      current,
      total,
      missing: Math.max(0, total - current),
      ...PILE_COLOR_ACCESSIBILITY[group.color],
    };
  });
  const current = colors.reduce((sum, color) => sum + color.current, 0);
  const total = colors.reduce((sum, color) => sum + color.total, 0);

  return {
    current,
    total,
    missing: Math.max(0, total - current),
    colors,
    groups,
    slots,
  };
}

function pileName(variant: PileInspectorVariant): string {
  return variant === "draw" ? "뽑기 더미" : "버린 카드 더미";
}

function buildAccessibleDescription(
  label: string,
  summary: PileSummary,
  variant: PileInspectorVariant,
  comparison: PileComparison,
  fallbackTotal?: number,
): string {
  if (variant === "draw") {
    const total = fallbackTotal ?? comparison.total;
    const colors = comparison.colors
      .map((item) => `${item.koreanLabel} ${item.colorLabel} ${item.current}/${item.total}장`)
      .join(", ");
    return `${label}, ${comparison.current}/${total}장 남음. ${colors}. 탭하거나 클릭하면 전체 덱 정보를 엽니다.`;
  }

  const colors = summary.colors
    .map(
      (item) =>
        `${item.koreanLabel} ${item.colorLabel} ${item.count}장`,
    )
    .join(", ");
  const topCard = summary.topCard
    ? `. 맨 위 카드는 ${PILE_COLOR_ACCESSIBILITY[summary.topCard.color].koreanLabel} ${PILE_COLOR_ACCESSIBILITY[summary.topCard.color].colorLabel} ${summary.topCard.rank}`
    : "";

  return `${label}, 총 ${summary.total}장. ${colors}${topCard}. 탭하거나 클릭하면 상세 덱 정보를 엽니다.`;
}

/**
 * The visible deck matrix is intentionally a custom panel, not a browser
 * `title` tooltip. That keeps the remaining-card information available on
 * hover without the small black native tooltip covering the deck artwork.
 */
function DrawPilePreview({
  comparison,
  fallbackTotal,
  hasReferenceCards,
  labelId,
}: {
  comparison: PileComparison;
  fallbackTotal?: number;
  hasReferenceCards: boolean;
  labelId: string;
}) {
  const displayedTotal = fallbackTotal ?? comparison.total;

  return (
    <section
      className={`deck-pile-compact-board${hasReferenceCards ? " has-reference-deck" : " is-current-only"}`}
      aria-labelledby={labelId}
    >
      <header className="deck-pile-compact-header">
        <span id={labelId} className="modal-visually-hidden">남은 덱</span>
        <strong><b>{comparison.current}</b>/{displayedTotal}장</strong>
      </header>

      <div className="deck-pile-compact-ranks" aria-label="숫자 카드">
        <span aria-hidden="true" />
        {RANK_ORDER.map((rank) => {
          const count = comparison.slots
            .filter((slot) => slot.rank === rank)
            .reduce((sum, slot) => sum + slot.current, 0);
          return (
            <span className="deck-pile-compact-rank" data-rank={rank} key={rank}>
              <b>{rank}</b>
              <small>{count}</small>
            </span>
          );
        })}
      </div>

      <div className="deck-pile-compact-rows" aria-label="색상별 남은 카드 수">
        {comparison.groups.map((group) => {
          const colorInfo = PILE_COLOR_ACCESSIBILITY[group.color];
          const colorSummary = comparison.colors.find((item) => item.color === group.color);
          return (
            <div className={`deck-pile-compact-row deck-pile-compact-row-${group.color}`} key={group.color}>
              <span className="deck-pile-compact-label">
                <i aria-hidden="true" />
                <small>{colorSummary?.current ?? 0}/{colorSummary?.total ?? 0}</small>
              </span>
              {group.cards.map((card) => (
                <span
                  className={`deck-pile-compact-cell is-${card.availability}`}
                  data-availability={card.availability}
                  data-color={card.color}
                  data-current={card.current}
                  data-rank={card.rank}
                  data-total={card.total}
                  key={`${card.color}-${card.rank}`}
                  aria-label={`${colorInfo.koreanLabel} ${colorInfo.colorLabel} ${card.rank}: ${card.current}/${card.total}장 남음`}
                >
                  {card.current}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function PileInspector({
  cards,
  variant,
  onOpenDetails,
  onPreviewChange,
  className,
  disabled = false,
  previewEnabled = true,
  referenceCards,
  totalCards,
  label = pileName(variant),
}: PileInspectorProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewId = useId();
  const summary = useMemo(() => summarizePile(cards), [cards]);
  const comparison = useMemo(
    () => comparePileToReference(cards, referenceCards ?? cards),
    [cards, referenceCards],
  );
  const fallbackTotal = referenceCards ? comparison.total : totalCards;
  const description = buildAccessibleDescription(
    label,
    summary,
    variant,
    comparison,
    fallbackTotal,
  );
  const topCard = variant === "discard" ? summary.topCard : undefined;

  function closePreview() {
    setPreviewOpen(false);
    onPreviewChange?.(false);
  }

  function openPreview() {
    if (!previewEnabled) return;
    setPreviewOpen(true);
    onPreviewChange?.(true);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) closePreview();
  }

  return (
    <div
      className={`deck-pile-inspector deck-pile-${variant}${summary.total === 0 ? " deck-pile-empty" : ""}${className ? ` ${className}` : ""}`}
      onPointerEnter={openPreview}
      onPointerLeave={closePreview}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLElement && event.target.matches(":focus-visible")) {
          openPreview();
        }
      }}
      onBlurCapture={handleBlur}
    >
      <button
        type="button"
        className="deck-pile-button"
        aria-label={description}
        aria-controls={previewId}
        aria-expanded={previewEnabled && previewOpen}
        disabled={disabled}
        onClick={() => {
          closePreview();
          onOpenDetails();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") closePreview();
        }}
      >
        <span className="deck-pile-button-label">{variant === "draw" ? "덱" : "버림"}</span>
        <span
          className={`deck-pile-card${topCard ? ` deck-pile-card-face deck-pile-card-${topCard.color}` : " deck-pile-card-back"}`}
          aria-hidden="true"
        >
          {topCard ? (
            <>
              <b>{topCard.rank}</b>
              <i>{PILE_COLOR_ACCESSIBILITY[topCard.color].symbol}</i>
            </>
          ) : (
            <i>{summary.total > 0 ? "◇" : "—"}</i>
          )}
        </span>
        <strong className="deck-pile-count">
          {variant === "draw" && fallbackTotal !== undefined ? `${summary.total}/${fallbackTotal}` : summary.total}
        </strong>
        <span className="deck-pile-open-hint">상세 보기</span>
      </button>

      <section
        id={previewId}
        className={`deck-pile-popover deck-pile-popover-${variant}`}
        aria-label={`${label} 구성 미리보기`}
        hidden={!previewOpen}
      >
        <header className="deck-pile-popover-header">
          <span>{variant === "draw" ? "남은 덱" : "버린 카드"}</span>
          <strong>{variant === "draw" && fallbackTotal !== undefined ? `${summary.total}/${fallbackTotal}장` : `${summary.total}장`}</strong>
        </header>
        {variant === "draw" ? (
          <DrawPilePreview comparison={comparison} fallbackTotal={fallbackTotal} hasReferenceCards={referenceCards !== undefined} labelId={`${previewId}-matrix`} />
        ) : (
          <div className="deck-pile-discard-preview">버린 카드 {summary.total}장</div>
        )}
      </section>
    </div>
  );
}
