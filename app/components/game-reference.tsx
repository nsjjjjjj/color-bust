"use client";

import type { CSSProperties } from "react";

import { HAND_RULES } from "../../lib/game/constants";
import {
  HAND_TYPES,
  type CardColor,
  type GameCard,
  type RunState,
} from "../../lib/game/types";
import { Modal } from "./modal";
import { PILE_COLOR_ACCESSIBILITY, summarizePile } from "./pile-inspector";

const bodyStyle: CSSProperties = {
  display: "grid",
  gap: 18,
  padding: 22,
};

const tableWrapStyle: CSSProperties = {
  overflowX: "auto",
  border: "1px solid var(--line)",
  borderRadius: 7,
};

const tableStyle: CSSProperties = {
  width: "100%",
  minWidth: 500,
  borderCollapse: "collapse",
  fontSize: 12,
  textAlign: "left",
};

const headerCellStyle: CSSProperties = {
  padding: "10px 12px",
  color: "var(--dim)",
  background: "#0c0f16",
  borderBottom: "1px solid var(--line)",
  font: "750 9px/1.3 ui-monospace, monospace",
  letterSpacing: ".06em",
  whiteSpace: "nowrap",
};

const cellStyle: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--line)",
  whiteSpace: "nowrap",
};

const numberStyle: CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontWeight: 900,
  fontVariantNumeric: "tabular-nums",
};

export interface HandGuideProps {
  handLevels: RunState["handLevels"];
  onClose: () => void;
}

export function HandGuide({ handLevels, onClose }: HandGuideProps) {
  return (
    <Modal title="족보 가이드" onClose={onClose} wide>
      <div style={bodyStyle}>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 11, lineHeight: 1.6 }}>
          족보의 기본 능력치와 이번 런에서 적용되는 현재 레벨을 확인하세요.
        </p>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              족보별 기본 칩, 기본 배수, 현재 레벨과 현재 능력치
            </caption>
            <thead>
              <tr>
                <th scope="col" style={headerCellStyle}>족보</th>
                <th scope="col" style={headerCellStyle}>기본 칩</th>
                <th scope="col" style={headerCellStyle}>기본 배수</th>
                <th scope="col" style={headerCellStyle}>현재 레벨</th>
                <th scope="col" style={headerCellStyle}>현재 칩 × 배수</th>
              </tr>
            </thead>
            <tbody>
              {HAND_TYPES.map((type) => {
                const rule = HAND_RULES[type];
                const level = Math.max(1, handLevels[type] ?? 1);
                const levelOffset = level - 1;
                const currentChips = rule.baseChips + rule.chipsPerLevel * levelOffset;
                const currentMultiplier = rule.baseMultiplier + rule.multiplierPerLevel * levelOffset;

                return (
                  <tr key={type}>
                    <th scope="row" style={{ ...cellStyle, fontWeight: 800 }}>{rule.name}</th>
                    <td style={{ ...cellStyle, ...numberStyle, color: "var(--blue)" }}>{rule.baseChips}</td>
                    <td style={{ ...cellStyle, ...numberStyle, color: "var(--red)" }}>×{rule.baseMultiplier}</td>
                    <td style={{ ...cellStyle, ...numberStyle }}>레벨 {level}</td>
                    <td style={{ ...cellStyle, ...numberStyle }}>
                      <span style={{ color: "var(--blue)" }}>{currentChips}</span>
                      {" × "}
                      <span style={{ color: "var(--red)" }}>{currentMultiplier}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

export interface DeckInspectorProps {
  drawPile: readonly GameCard[];
  discardPile: readonly GameCard[];
  hand: readonly GameCard[];
  onClose: () => void;
}

const COLOR_LABELS: Readonly<Record<CardColor, string>> = {
  red: "빨강",
  blue: "파랑",
  green: "초록",
  yellow: "노랑",
};

export function DeckInspector({ drawPile, discardPile, hand, onClose }: DeckInspectorProps) {
  const piles = [
    { id: "draw", label: "드로우 더미", cards: drawPile },
    { id: "discard", label: "버린 더미", cards: discardPile },
    { id: "hand", label: "현재 손패", cards: hand },
  ] as const;
  const allCards = [...drawPile, ...discardPile, ...hand];
  const deckSize = allCards.length;
  const totalSummary = summarizePile(allCards);
  const ranks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
  const colorOrder: readonly CardColor[] = ["red", "yellow", "green", "blue"];
  const sortedPiles = piles.map((pile) => ({
    ...pile,
    summary: summarizePile(pile.cards),
    sortedCards: [...pile.cards].sort((left, right) => left.rank - right.rank || colorOrder.indexOf(left.color) - colorOrder.indexOf(right.color)),
  }));

  return (
    <Modal title="덱 인스펙터" onClose={onClose} wide>
      <div className="deck-inspector-layout">
        <p className="deck-inspector-summary">
          현재 숫자 덱 <strong>{deckSize}장</strong>의 위치와 구성을 보여줍니다. 커뮤니티 효과 카드는 숫자 덱과 분리되어 오른쪽 효과 슬롯에 보관됩니다.
        </p>

        <section className="deck-inspector-piles" aria-label="위치별 카드 분포">
          {sortedPiles.map((pile) => (
            <article className="deck-inspector-pile" key={pile.id}>
              <header><span>{pile.label}</span><strong>{pile.cards.length}장</strong></header>
              <div className="deck-inspector-color-row">
                {colorOrder.map((color) => (
                  <span
                    key={color}
                    title={`${PILE_COLOR_ACCESSIBILITY[color].koreanLabel} ${COLOR_LABELS[color]} ${pile.summary.byColor[color]}장`}
                    aria-label={`${PILE_COLOR_ACCESSIBILITY[color].koreanLabel} ${COLOR_LABELS[color]} ${pile.summary.byColor[color]}장`}
                  >
                    <b aria-hidden="true">{PILE_COLOR_ACCESSIBILITY[color].symbol}</b>
                    {pile.summary.byColor[color]}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </section>

        <section className="deck-inspector-ranks" aria-labelledby="deck-inspector-ranks-title">
          <header><span id="deck-inspector-ranks-title">숫자별 전체 구성</span><small>0은 10칩</small></header>
          <div className="deck-inspector-rank-grid">
            {ranks.map((rank) => <span key={rank}><b>{rank}</b><small>×{totalSummary.byRank[rank]}</small></span>)}
          </div>
        </section>

        <section className="deck-inspector-card-groups" aria-label="위치별 카드 목록">
          {sortedPiles.map((pile) => (
            <article className="deck-inspector-card-group" key={pile.id}>
              <h3>{pile.label} · {pile.cards.length}</h3>
              <div className="deck-inspector-card-list">
                {pile.sortedCards.map((card) => (
                  <span
                    className={`deck-inspector-card card-${card.color}`}
                    key={card.id}
                    title={`${PILE_COLOR_ACCESSIBILITY[card.color].koreanLabel} ${COLOR_LABELS[card.color]} ${card.rank}`}
                    aria-label={`${PILE_COLOR_ACCESSIBILITY[card.color].koreanLabel} ${COLOR_LABELS[card.color]} ${card.rank} 카드`}
                  >
                    <b>{card.rank}</b>
                  </span>
                ))}
                {pile.cards.length === 0 && <small>비어 있음</small>}
              </div>
            </article>
          ))}
        </section>
      </div>
    </Modal>
  );
}

export interface ShortcutDefinition {
  readonly keys: readonly string[];
  readonly description: string;
}

export const DEFAULT_SHORTCUTS: readonly ShortcutDefinition[] = [
  { keys: ["1–8"], description: "해당 위치의 손패를 선택하거나 해제" },
  { keys: ["Enter"], description: "선택한 카드로 핸드 제출" },
  { keys: ["D"], description: "선택한 카드 버리기" },
  { keys: ["S"], description: "현재 손패를 숫자순·색상순으로 한 번 정렬" },
  { keys: ["U"], description: "커뮤니티 메이헴 카드 선택 또는 해제" },
  { keys: ["H"], description: "족보 가이드 열기" },
  { keys: ["K"], description: "덱 인스펙터 열기" },
  { keys: ["?"], description: "단축키 도움말 열기" },
  { keys: ["Esc"], description: "열린 창 닫기 또는 카드 선택 해제" },
] as const;

export interface ShortcutGuideProps {
  onClose: () => void;
  shortcuts?: readonly ShortcutDefinition[];
}

export function ShortcutGuide({ onClose, shortcuts = DEFAULT_SHORTCUTS }: ShortcutGuideProps) {
  return (
    <Modal title="키보드 단축키" onClose={onClose}>
      <div style={bodyStyle}>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 11, lineHeight: 1.6 }}>
          입력창에 포커스가 있을 때는 게임 단축키가 작동하지 않습니다.
        </p>
        <dl style={{ display: "grid", gap: 8, margin: 0 }}>
          {shortcuts.map((shortcut) => (
            <div
              key={`${shortcut.keys.join("+")}-${shortcut.description}`}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(90px, auto) 1fr",
                alignItems: "center",
                gap: 14,
                padding: 11,
                border: "1px solid var(--line)",
                borderRadius: 6,
                background: "var(--panel-2)",
              }}
            >
              <dt style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    style={{
                      minWidth: 30,
                      padding: "6px 8px",
                      border: "1px solid #555e72",
                      borderRadius: 4,
                      background: "#090c12",
                      boxShadow: "inset 0 -2px 0 rgba(255,255,255,.08)",
                      font: "800 10px/1 ui-monospace, monospace",
                      textAlign: "center",
                    }}
                  >
                    {key}
                  </kbd>
                ))}
              </dt>
              <dd style={{ margin: 0, color: "var(--muted)", fontSize: 11, lineHeight: 1.45 }}>
                {shortcut.description}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  );
}
