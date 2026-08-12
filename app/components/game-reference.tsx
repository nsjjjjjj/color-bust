"use client";

import type { CSSProperties } from "react";

import { HAND_RULES } from "../../lib/game/constants";
import {
  HAND_TYPES,
  type GameCard,
  type HandType,
  type RunState,
} from "../../lib/game/types";
import { Modal } from "./modal";
import { DeckCardGrid } from "./deck-card-grid";

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
  minWidth: 720,
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

const HAND_REQUIREMENTS: Readonly<Record<HandType, string>> = {
  "high-card": "어떤 족보도 없을 때 가장 높은 숫자 1장으로 득점",
  pair: "같은 숫자 2장",
  "two-pair": "서로 다른 같은 숫자 묶음 2개",
  "three-of-a-kind": "같은 숫자 3장",
  straight: "이어지는 숫자 5장",
  flush: "같은 채널 카드 5장",
  "full-house": "같은 숫자 3장과 다른 같은 숫자 2장",
  "four-of-a-kind": "같은 숫자 4장",
  "straight-flush": "같은 채널이면서 이어지는 숫자 5장",
};

export function HandGuide({ handLevels, onClose }: HandGuideProps) {
  return (
    <Modal title="런 정보 · 족보" onClose={onClose} wide>
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
                <th scope="col" style={headerCellStyle}>만드는 법</th>
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
                    <td style={{ ...cellStyle, color: "var(--muted)", whiteSpace: "normal", lineHeight: 1.5 }} title={HAND_REQUIREMENTS[type]}>{HAND_REQUIREMENTS[type]}</td>
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
  /** Authoritative persistent run deck. Pack additions may not be in a round zone yet. */
  deck?: readonly GameCard[];
  drawPile: readonly GameCard[];
  discardPile: readonly GameCard[];
  hand: readonly GameCard[];
  onClose: () => void;
}

export function DeckInspector({ deck, drawPile, discardPile, hand, onClose }: DeckInspectorProps) {
  const zoneCards = [...drawPile, ...discardPile, ...hand];
  const allCards = deck?.length ? [...deck] : zoneCards;

  return (
    <Modal title="덱 인스펙터" onClose={onClose} wide className="deck-inspector-modal">
      <div className="deck-inspector-layout deck-inspector-layout--cards-only">
        <DeckCardGrid cards={allCards} ariaLabel="현재 런 덱 전체 카드" />
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
