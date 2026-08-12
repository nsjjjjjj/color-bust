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
  readonly className?: string;
  readonly disabled?: boolean;
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

function DrawPilePreview({
  comparison,
  hasReferenceCards,
  popoverId,
  fallbackTotal,
}: {
  comparison: PileComparison;
  hasReferenceCards: boolean;
  popoverId: string;
  fallbackTotal?: number;
}) {
  const displayedTotal = fallbackTotal ?? comparison.total;

  return (
    <div className={`deck-pile-draw-preview${hasReferenceCards ? " has-reference-deck" : " is-current-only"}`}>
      <aside className="deck-pile-draw-summary" aria-label="덱 남은 수 요약">
        <div className="deck-pile-overall">
          <span>전체 남음</span>
          <strong>
            <b>{comparison.current}</b>
            <i aria-hidden="true">/</i>
            <small>{displayedTotal}</small>
          </strong>
          <em>
            {!hasReferenceCards
              ? "현재 더미 기준"
              : comparison.missing > 0
                ? `${comparison.missing}장 더미 밖`
                : "전체 대기 중"}
          </em>
        </div>

        <div className="deck-pile-color-counts deck-pile-color-comparison" aria-label="색상별 남은 카드 수">
          {comparison.colors.map((item) => (
            <div
              className={`deck-pile-color deck-pile-color-${item.color}${item.current === 0 ? " is-depleted" : ""}`}
              key={item.color}
              title={`${item.koreanLabel} (${item.colorLabel}) ${item.current}/${item.total}장 남음`}
            >
              <span className="deck-pile-color-symbol" aria-hidden="true">{item.symbol}</span>
              <span className="deck-pile-color-copy">
                <b>{item.koreanLabel}</b>
                <small>{item.colorLabel}</small>
              </span>
              <strong className="deck-pile-color-count">
                <b>{item.current}</b><small>/{item.total}</small>
              </strong>
            </div>
          ))}
        </div>
      </aside>

      <section className="deck-pile-card-matrix" aria-label="색상과 숫자별 덱 현황">
        <header className="deck-pile-mini-header">
          <span>카드별 현황</span>
          <small>남은 수 / 전체 수</small>
        </header>

        <div className="deck-pile-mini-groups">
          {comparison.groups.map((group) => {
            const colorInfo = PILE_COLOR_ACCESSIBILITY[group.color];
            const groupLabelId = `${popoverId}-${group.color}-cards`;
            const colorSummary = comparison.colors.find((item) => item.color === group.color);

            return (
              <div
                className={`deck-pile-mini-group deck-pile-mini-group-${group.color}`}
                key={group.color}
                role="group"
                aria-labelledby={groupLabelId}
              >
                <span className="deck-pile-mini-group-label" id={groupLabelId}>
                  <i aria-hidden="true">{colorInfo.symbol}</i>
                  <b>{colorInfo.koreanLabel}</b>
                  <small>{colorSummary?.current ?? 0}/{colorSummary?.total ?? 0}</small>
                </span>
                <div className="deck-pile-mini-grid" role="list">
                  {group.cards.map((card) => (
                    <span
                      className={`deck-pile-mini-card deck-pile-mini-card-${card.color} is-${card.availability}`}
                      data-availability={card.availability}
                      data-color={card.color}
                      data-current={card.current}
                      data-rank={card.rank}
                      data-total={card.total}
                      key={`${card.color}-${card.rank}`}
                      role="listitem"
                      aria-label={`${colorInfo.koreanLabel} ${colorInfo.colorLabel} ${card.rank}, ${card.current}/${card.total}장 남음${card.availability === "partial" ? ", 일부가 뽑기 더미 밖에 있음" : card.availability === "depleted" ? ", 현재 뽑기 더미에 없음" : card.availability === "absent" ? ", 현재 덱에 없음" : ""}`}
                      title={`${colorInfo.koreanLabel} (${colorInfo.colorLabel}) ${card.rank} · ${card.current}/${card.total}`}
                    >
                      <b>{card.rank}</b>
                      <i aria-hidden="true">{colorInfo.symbol}</i>
                      <small className="deck-pile-mini-card-ratio" aria-hidden="true">
                        <b>{card.current}</b>/<span>{card.total}</span>
                      </small>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <p className="deck-pile-reference-note">
          {hasReferenceCards
            ? "색상 카드 = 남음 · 회색 카드 = 뽑기 더미 밖"
            : "전체 런 덱 기준 정보가 연결되면 빠진 카드도 표시됩니다."}
        </p>
      </section>
    </div>
  );
}

function DiscardPilePreview({ summary }: { summary: PileSummary }) {
  const topCard = summary.topCard;

  return (
    <div className="deck-pile-discard-preview">
      <div className="deck-pile-color-counts" aria-label="색상별 버린 카드 수">
        {summary.colors.map((item) => (
          <div
            className={`deck-pile-color deck-pile-color-${item.color}`}
            key={item.color}
            title={`${item.koreanLabel} (${item.colorLabel}) ${item.count}장`}
          >
            <span className="deck-pile-color-symbol" aria-hidden="true">{item.symbol}</span>
            <span className="deck-pile-color-copy">
              <b>{item.koreanLabel}</b>
              <small>{item.colorLabel}</small>
            </span>
            <strong className="deck-pile-color-count">{item.count}</strong>
          </div>
        ))}
      </div>

      <div className="deck-pile-rank-section">
        <span className="deck-pile-rank-heading">숫자별 버린 카드</span>
        <div className="deck-pile-rank-counts" aria-label="숫자별 버린 카드 수">
          {RANK_ORDER.map((rank) => (
            <span
              className={`deck-pile-rank${summary.byRank[rank] === 0 ? " deck-pile-rank-zero" : ""}`}
              key={rank}
              title={`숫자 ${rank}, ${summary.byRank[rank]}장`}
            >
              <b>{rank}</b>
              <small>{summary.byRank[rank]}</small>
            </span>
          ))}
        </div>
      </div>

      {topCard && (
        <footer className="deck-pile-top-card">
          <span>맨 위 카드</span>
          <strong>
            <i aria-hidden="true">{PILE_COLOR_ACCESSIBILITY[topCard.color].symbol}</i>
            {PILE_COLOR_ACCESSIBILITY[topCard.color].koreanLabel} {PILE_COLOR_ACCESSIBILITY[topCard.color].colorLabel} {topCard.rank}
          </strong>
        </footer>
      )}
    </div>
  );
}

export function PileInspector({
  cards,
  variant,
  onOpenDetails,
  className,
  disabled = false,
  referenceCards,
  totalCards,
  label = pileName(variant),
}: PileInspectorProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const popoverId = useId();
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

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setPreviewOpen(false);
    }
  }

  return (
    <div
      className={`deck-pile-inspector deck-pile-${variant}${summary.total === 0 ? " deck-pile-empty" : ""}${className ? ` ${className}` : ""}`}
      onPointerEnter={() => setPreviewOpen(true)}
      onPointerLeave={() => setPreviewOpen(false)}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLElement && event.target.matches(":focus-visible")) {
          setPreviewOpen(true);
        }
      }}
      onBlurCapture={handleBlur}
    >
      <button
        type="button"
        className="deck-pile-button"
        aria-label={description}
        aria-describedby={popoverId}
        aria-controls={popoverId}
        aria-expanded={previewOpen}
        aria-haspopup="dialog"
        disabled={disabled}
        title={description}
        onClick={() => {
          setPreviewOpen(false);
          onOpenDetails();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setPreviewOpen(false);
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
        id={popoverId}
        className={`deck-pile-popover deck-pile-popover-${variant}`}
        role="tooltip"
        aria-label={`${label} 구성 미리보기`}
        hidden={!previewOpen}
      >
        <header className="deck-pile-popover-header">
          <span>{variant === "draw" ? "남은 덱" : "버린 카드"}</span>
          <strong>{variant === "draw" && fallbackTotal !== undefined ? `${summary.total}/${fallbackTotal}장` : `${summary.total}장`}</strong>
        </header>

        {variant === "draw" ? (
          <DrawPilePreview
            comparison={comparison}
            fallbackTotal={fallbackTotal}
            hasReferenceCards={referenceCards !== undefined}
            popoverId={popoverId}
          />
        ) : (
          <DiscardPilePreview summary={summary} />
        )}

        <p className="deck-pile-popover-hint">탭하거나 클릭하면 전체 덱 정보를 엽니다.</p>
      </section>
    </div>
  );
}
