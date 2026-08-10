"use client";

import type { ReactNode } from "react";

import {
  CARD_COLORS,
  HAND_RULES,
  JOKER_CATALOG,
  JOKER_SLOT_LIMIT,
  UNO_SLOT_LIMIT,
} from "../../lib/game/constants";
import {
  HAND_TYPES,
  type CardColor,
  type GameCard,
  type RunState,
  type ScoreBreakdown,
} from "../../lib/game/types";

const ROUND_LABELS: Readonly<Record<RunState["round"], string>> = {
  small: "SMALL BLIND",
  big: "BIG BLIND",
  boss: "BOSS BLIND",
};

const ROUND_NAMES: Readonly<Record<RunState["round"], string>> = {
  small: "스몰 블라인드",
  big: "빅 블라인드",
  boss: "보스 블라인드",
};

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

export interface GameLeftRailProps {
  run: RunState;
  breakdown?: ScoreBreakdown | null;
  onOpenHandGuide: () => void;
  onOpenDeckInspector: () => void;
  onOpenShortcutGuide: () => void;
  /** Optional in-run control, such as the Hot Swap color picker. */
  children?: ReactNode;
}

export function GameLeftRail({
  run,
  breakdown,
  onOpenHandGuide,
  onOpenDeckInspector,
  onOpenShortcutGuide,
  children,
}: GameLeftRailProps) {
  const progress = run.target > 0 ? Math.min(100, (run.score / run.target) * 100) : 0;

  return (
    <aside className="game-left-rail" aria-label="현재 라운드 정보와 게임 도구">
      <section className="pixel-panel game-left-rail-round" aria-labelledby="left-rail-round-title">
        <header className="pixel-panel-title">
          <span>ANTE {run.ante}{run.mode === "standard" ? " / 5" : " ∞"}</span>
          <h2 id="left-rail-round-title">{ROUND_LABELS[run.round]}</h2>
        </header>
        <p className="game-left-rail-round-name">{ROUND_NAMES[run.round]}</p>
        <div className="game-left-rail-score">
          <div>
            <span>현재 점수</span>
            <strong>{run.score.toLocaleString()}</strong>
          </div>
          <div>
            <span>목표 점수</span>
            <strong>{run.target.toLocaleString()}</strong>
          </div>
        </div>
        <progress
          className="game-left-rail-progress"
          max={100}
          value={progress}
          aria-label={`목표 점수 진행률 ${Math.floor(progress)}%`}
        >
          {Math.floor(progress)}%
        </progress>
        {breakdown && (
          <p className="game-left-rail-preview" aria-live="polite">
            <span>{breakdown.handName} · Lv.{breakdown.handLevel}</span>
            <strong>{breakdown.total.toLocaleString()}점</strong>
          </p>
        )}
        {run.round === "boss" && (
          <div className="game-left-rail-boss" role="note">
            <strong>WARNING · BOSS BLIND</strong>
            <span>이번 앤티의 마지막 관문입니다. 높은 목표 점수를 달성하세요.</span>
          </div>
        )}
      </section>

      <section className="pixel-panel game-left-rail-resources" aria-labelledby="left-rail-resource-title">
        <h2 className="pixel-panel-title" id="left-rail-resource-title">RUN RESOURCES</h2>
        <dl>
          <div><dt>핸드</dt><dd>{run.handsLeft}</dd></div>
          <div><dt>버리기</dt><dd>{run.discardsLeft}</dd></div>
          <div><dt>코인</dt><dd>{run.coins} ¢</dd></div>
        </dl>
      </section>

      <nav className="pixel-panel game-left-rail-tools" aria-label="게임 참고 도구">
        <h2 className="pixel-panel-title">REFERENCE</h2>
        <button type="button" onClick={onOpenHandGuide}>
          <span aria-hidden="true">♠</span><span>족보 가이드</span><kbd>H</kbd>
        </button>
        <button type="button" onClick={onOpenDeckInspector}>
          <span aria-hidden="true">▤</span><span>덱 인스펙터</span><kbd>K</kbd>
        </button>
        <button type="button" onClick={onOpenShortcutGuide}>
          <span aria-hidden="true">?</span><span>단축키</span><kbd>?</kbd>
        </button>
      </nav>

      {children && (
        <section className="pixel-panel game-left-rail-hot-swap" aria-labelledby="left-rail-hot-swap-title">
          <h2 className="pixel-panel-title" id="left-rail-hot-swap-title">HOT SWAP</h2>
          {children}
        </section>
      )}
    </aside>
  );
}

export interface GameRightRailProps {
  run: RunState;
  breakdown?: ScoreBreakdown | null;
}

export function GameRightRail({ run, breakdown }: GameRightRailProps) {
  const allCards = [...run.drawPile, ...run.discardPile, ...run.hand];
  const colors = countColors(allCards);

  return (
    <aside className="game-right-rail" aria-label="현재 덱, 조커와 족보 정보">
      <section className="pixel-panel game-right-rail-summary" aria-labelledby="right-rail-summary-title">
        <h2 className="pixel-panel-title" id="right-rail-summary-title">RUN LOADOUT</h2>
        <dl>
          <div>
            <dt>DRAW</dt>
            <dd>{run.drawPile.length}</dd>
            <small>손패 {run.hand.length} · 버림 {run.discardPile.length}</small>
          </div>
          <div>
            <dt>JOKER</dt>
            <dd>{run.jokers.length} / {JOKER_SLOT_LIMIT}</dd>
          </div>
          <div>
            <dt>UNO</dt>
            <dd>{run.communityUno.length} / {UNO_SLOT_LIMIT}</dd>
          </div>
        </dl>
      </section>

      <section className="pixel-panel game-right-rail-colors" aria-labelledby="right-rail-colors-title">
        <h2 className="pixel-panel-title" id="right-rail-colors-title">
          COLOR DECK · {allCards.length} / 40
        </h2>
        <ul aria-label="전체 덱 색상별 카드 수">
          {CARD_COLORS.map((color) => (
            <li key={color} className={`game-right-rail-color game-right-rail-color-${color}`}>
              <span aria-hidden="true" className="game-right-rail-color-dot" />
              <span>{COLOR_LABELS[color]}</span>
              <strong>{colors[color]}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="pixel-panel game-right-rail-jokers" aria-labelledby="right-rail-jokers-title">
        <h2 className="pixel-panel-title" id="right-rail-jokers-title">JOKER EFFECTS</h2>
        {run.jokers.length > 0 ? (
          <ul>
            {run.jokers.map((joker) => {
              const definition = JOKER_CATALOG[joker.jokerId];
              return (
                <li key={joker.instanceId}>
                  <span className={`game-right-rail-joker-mark rarity-${definition.rarity}`} aria-hidden="true">
                    {definition.name.slice(0, 1)}
                  </span>
                  <span>
                    <strong>{definition.name}</strong>
                    <small>{definition.description}</small>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="game-right-rail-empty">보유한 조커가 없습니다.</p>
        )}
      </section>

      <section className="pixel-panel game-right-rail-hands" aria-labelledby="right-rail-hands-title">
        <h2 className="pixel-panel-title" id="right-rail-hands-title">HAND VALUES</h2>
        <div className="game-right-rail-hand-table-wrap">
          <table>
            <caption>현재 레벨이 적용된 족보별 칩과 배수</caption>
            <thead>
              <tr>
                <th scope="col">족보</th>
                <th scope="col">레벨</th>
                <th scope="col">CHIPS × MULT</th>
              </tr>
            </thead>
            <tbody>
              {HAND_TYPES.map((type) => {
                const rule = HAND_RULES[type];
                const level = Math.max(1, run.handLevels[type] ?? 1);
                const currentChips = rule.baseChips + rule.chipsPerLevel * (level - 1);
                const currentMultiplier = rule.baseMultiplier + rule.multiplierPerLevel * (level - 1);
                const current = breakdown?.handType === type;

                return (
                  <tr key={type} className={current ? "is-current" : undefined} aria-current={current ? "true" : undefined}>
                    <th scope="row">{rule.name}</th>
                    <td>Lv.{level}</td>
                    <td><strong>{currentChips}</strong><span> × </span><strong>{currentMultiplier}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </aside>
  );
}
