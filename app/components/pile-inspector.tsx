"use client";

import { useId, useMemo, useState, type FocusEvent } from "react";

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
    koreanLabel: "불꽃",
    colorLabel: "빨강",
  },
  yellow: {
    symbol: "✦",
    symbolName: "Spark",
    koreanLabel: "불티",
    colorLabel: "노랑",
  },
  green: {
    symbol: "◆",
    symbolName: "Leaf",
    koreanLabel: "잎사귀",
    colorLabel: "초록",
  },
  blue: {
    symbol: "▼",
    symbolName: "Drop",
    koreanLabel: "물방울",
    colorLabel: "파랑",
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

function pileName(variant: PileInspectorVariant): string {
  return variant === "draw" ? "뽑기 더미" : "버린 카드 더미";
}

function buildAccessibleDescription(
  label: string,
  summary: PileSummary,
  variant: PileInspectorVariant,
): string {
  const colors = summary.colors
    .map(
      (item) =>
        `${item.koreanLabel} ${item.colorLabel} ${item.count}장`,
    )
    .join(", ");
  const topCard =
    variant === "discard" && summary.topCard
      ? `. 맨 위 카드는 ${PILE_COLOR_ACCESSIBILITY[summary.topCard.color].koreanLabel} ${PILE_COLOR_ACCESSIBILITY[summary.topCard.color].colorLabel} ${summary.topCard.rank}`
      : "";

  return `${label}, 총 ${summary.total}장. ${colors}${topCard}. 탭하거나 클릭하면 상세 덱 정보를 엽니다.`;
}

export function PileInspector({
  cards,
  variant,
  onOpenDetails,
  className,
  disabled = false,
  label = pileName(variant),
}: PileInspectorProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const popoverId = useId();
  const summary = useMemo(() => summarizePile(cards), [cards]);
  const description = buildAccessibleDescription(label, summary, variant);
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
      onFocusCapture={() => setPreviewOpen(true)}
      onBlurCapture={handleBlur}
    >
      <button
        type="button"
        className="deck-pile-button"
        aria-label={description}
        aria-describedby={popoverId}
        aria-expanded={previewOpen}
        aria-haspopup="dialog"
        disabled={disabled}
        title={description}
        onClick={onOpenDetails}
        onKeyDown={(event) => {
          if (event.key === "Escape") setPreviewOpen(false);
        }}
      >
        <span className="deck-pile-button-label">{variant === "draw" ? "DRAW" : "USED"}</span>
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
        <strong className="deck-pile-count">{summary.total}</strong>
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
          <span>{variant === "draw" ? "DRAW PILE" : "DISCARD PILE"}</span>
          <strong>{summary.total}장</strong>
        </header>

        <div className="deck-pile-color-counts" aria-label="색상별 카드 수">
          {summary.colors.map((item) => (
            <div
              className={`deck-pile-color deck-pile-color-${item.color}`}
              key={item.color}
              title={`${item.symbolName} · ${item.koreanLabel} ${item.colorLabel} ${item.count}장`}
            >
              <span className="deck-pile-color-symbol" aria-hidden="true">{item.symbol}</span>
              <span className="deck-pile-color-copy">
                <b>{item.koreanLabel}</b>
                <small>{item.colorLabel} · {item.symbolName}</small>
              </span>
              <strong className="deck-pile-color-count">{item.count}</strong>
            </div>
          ))}
        </div>

        <div className="deck-pile-rank-section">
          <span className="deck-pile-rank-heading">숫자별 카드 수</span>
          <div className="deck-pile-rank-counts" aria-label="숫자별 카드 수">
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

        {variant === "discard" && topCard && (
          <footer className="deck-pile-top-card">
            <span>맨 위 카드</span>
            <strong>
              <i aria-hidden="true">{PILE_COLOR_ACCESSIBILITY[topCard.color].symbol}</i>
              {PILE_COLOR_ACCESSIBILITY[topCard.color].koreanLabel} {PILE_COLOR_ACCESSIBILITY[topCard.color].colorLabel} {topCard.rank}
            </strong>
          </footer>
        )}

        <p className="deck-pile-popover-hint">탭하거나 클릭하면 전체 덱 정보를 엽니다.</p>
      </section>
    </div>
  );
}
