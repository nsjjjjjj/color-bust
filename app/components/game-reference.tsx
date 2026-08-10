"use client";

import type { CSSProperties } from "react";

import { CARD_COLORS, HAND_RULES } from "../../lib/game/constants";
import {
  HAND_TYPES,
  type CardColor,
  type GameCard,
  type RunState,
} from "../../lib/game/types";
import { Modal } from "./modal";

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
                <th scope="col" style={headerCellStyle}>기본 CHIPS</th>
                <th scope="col" style={headerCellStyle}>기본 MULT</th>
                <th scope="col" style={headerCellStyle}>현재 레벨</th>
                <th scope="col" style={headerCellStyle}>현재 CHIPS × MULT</th>
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
                    <td style={{ ...cellStyle, ...numberStyle }}>Lv.{level}</td>
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

function countColors(cards: readonly GameCard[]): Readonly<Record<CardColor, number>> {
  const counts: Record<CardColor, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
  for (const card of cards) counts[card.color] += 1;
  return counts;
}

export function DeckInspector({ drawPile, discardPile, hand, onClose }: DeckInspectorProps) {
  const piles = [
    { id: "draw", label: "드로우 더미", cards: drawPile },
    { id: "discard", label: "버린 더미", cards: discardPile },
    { id: "hand", label: "현재 손패", cards: hand },
  ] as const;
  const deckSize = drawPile.length + discardPile.length + hand.length;

  return (
    <Modal title="덱 인스펙터" onClose={onClose}>
      <div style={bodyStyle}>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 11, lineHeight: 1.6 }}>
          현재 런의 카드 <strong style={{ color: "var(--ink)" }}>{deckSize}장</strong>이 어디에 있는지 색상별로 보여줍니다.
        </p>
        <div style={tableWrapStyle}>
          <table style={{ ...tableStyle, minWidth: 460 }}>
            <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              드로우 더미, 버린 더미와 현재 손패의 총 장수 및 색상별 분포
            </caption>
            <thead>
              <tr>
                <th scope="col" style={headerCellStyle}>위치</th>
                <th scope="col" style={headerCellStyle}>전체</th>
                {CARD_COLORS.map((color) => (
                  <th scope="col" style={headerCellStyle} key={color}>
                    <span aria-hidden="true" style={{ color: `var(--${color})` }}>● </span>
                    {COLOR_LABELS[color]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {piles.map((pile) => {
                const distribution = countColors(pile.cards);
                return (
                  <tr key={pile.id}>
                    <th scope="row" style={{ ...cellStyle, fontWeight: 800 }}>{pile.label}</th>
                    <td style={{ ...cellStyle, ...numberStyle }}>{pile.cards.length}장</td>
                    {CARD_COLORS.map((color) => (
                      <td key={color} style={{ ...cellStyle, ...numberStyle, color: `var(--${color})` }}>
                        {distribution[color]}
                      </td>
                    ))}
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

export interface ShortcutDefinition {
  readonly keys: readonly string[];
  readonly description: string;
}

export const DEFAULT_SHORTCUTS: readonly ShortcutDefinition[] = [
  { keys: ["1–8"], description: "해당 위치의 손패를 선택하거나 해제" },
  { keys: ["Enter"], description: "선택한 카드로 핸드 제출" },
  { keys: ["D"], description: "선택한 카드 버리기" },
  { keys: ["A"], description: "현재 효과를 반영한 최고 점수 패 자동 선택" },
  { keys: ["S"], description: "받은 순서, 숫자순, 색상순 정렬 전환" },
  { keys: ["U"], description: "커뮤니티 UNO 선택 또는 해제" },
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
