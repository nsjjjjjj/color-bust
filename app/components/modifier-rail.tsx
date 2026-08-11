"use client";

import { useId, useRef, useState } from "react";

import {
  JOKER_CATALOG,
  JOKER_SLOT_LIMIT,
  UNO_MODULE_CATALOG,
  UNO_SLOT_LIMIT,
} from "../../lib/game/constants";
import type {
  AppliedEffect,
  CardColor,
  CommunityUnoCard,
  JokerId,
  JokerInstance,
  RunState,
  ScoreBreakdown,
  UnoModuleId,
} from "../../lib/game/types";
import type { ScoreEvent } from "../../lib/game/score-events";

const JOKER_ICONS: Readonly<Record<JokerId, string>> = {
  "zero-day": "0",
  redline: "R",
  "blue-buffer": "B",
  "green-loop": "↻",
  "yellow-ticket": "¢",
  "odd-signal": "1",
  "even-signal": "2",
  "cache-hit": "◆",
  "splash-mode": "≈",
  "spectrum-analyzer": "◈",
  "monochrome-monitor": "▣",
  "sequence-accelerator": "→",
  "full-stack": "▤",
  "spare-battery": "▱",
  "last-commit": "!",
  "version-control": "⇄",
  "cmyk-core": "✦",
  "combo-compiler": "⌘",
  "hot-swap": "↔",
  "null-pointer": "∅",
};

const RARITY_LABELS = {
  common: "STANDARD",
  uncommon: "UNCOMMON",
  rare: "RARE",
} as const;

const COLOR_LABELS: Readonly<Record<CardColor, string>> = {
  red: "빨강",
  blue: "파랑",
  green: "초록",
  yellow: "노랑",
};

export interface ModifierRailProps {
  run: RunState;
  /** The hand currently resolving, or the most recently resolved hand. */
  breakdown?: ScoreBreakdown | null;
  scoreEvent?: ScoreEvent | null;
  className?: string;
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function effectValue(effect: AppliedEffect): string {
  const values: string[] = [];
  if (effect.chips) values.push(`${signed(effect.chips)} POWER`);
  if (effect.multiplier) values.push(`${signed(effect.multiplier)} HYPE`);
  if (effect.xMultiplier && effect.xMultiplier !== 1) {
    values.push(`×${effect.xMultiplier.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`);
  }
  if (effect.coins) values.push(`${signed(effect.coins)}¢`);
  return values.join(" · ") || effect.description;
}

function mayhemCopy(value: string): string {
  return value.replace(/UNO/g, "메이헴");
}

function jokerCondition(joker: JokerInstance): string {
  if (joker.selectedColor) return `선택 색상: ${COLOR_LABELS[joker.selectedColor]}`;
  if (joker.counter !== undefined) return `연속 스택: ${joker.counter}/4`;
  return `획득 라운드: ${joker.acquiredRound}`;
}

function jokerLevel(joker: JokerInstance): string {
  if (joker.counter !== undefined) return `연속 ${joker.counter}/4`;
  if (joker.selectedColor) return COLOR_LABELS[joker.selectedColor];
  return "패시브";
}

function moduleIds(card: CommunityUnoCard): readonly UnoModuleId[] {
  return [...card.positiveModules, ...card.negativeModules];
}

function unoPointTotal(card: CommunityUnoCard): number {
  return moduleIds(card).reduce(
    (total, moduleId) => total + UNO_MODULE_CATALOG[moduleId].points,
    0,
  );
}

export function ModifierRail({ run, breakdown, scoreEvent, className }: ModifierRailProps) {
  const reactId = safeId(useId());
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);
  const pointerOpenedTooltip = useRef<string | null>(null);
  const appliedJokerEffects = breakdown?.appliedJokers ?? [];
  const appliedUno = breakdown?.uno;
  const appliedCount = appliedJokerEffects.length + (appliedUno ? 1 : 0);
  const outerClassName = ["modifier-rail-root", className].filter(Boolean).join(" ");

  const showTooltip = (key: string) => setOpenTooltip(key);
  const hideTooltip = (key: string) => {
    setOpenTooltip((current) => (current === key ? null : current));
  };

  return (
    <aside className={outerClassName} aria-label="보유 효과와 이번 핸드 적용 상태">
      <header className="modifier-rail-header">
        <span className="modifier-rail-header-icon" aria-hidden="true">✦</span>
        <div className="modifier-rail-header-copy">
          <strong>보유 효과</strong>
          <small>MOD {run.jokers.length} · MAYHEM {run.communityUno.length}</small>
        </div>
      </header>

      <section className="modifier-rail-section" aria-labelledby={`${reactId}-jokers-title`}>
        <header className="modifier-rail-section-header">
          <h2 id={`${reactId}-jokers-title`}>MOD</h2>
          <span>{run.jokers.length}/{JOKER_SLOT_LIMIT}</span>
        </header>
        <div className="modifier-rail-slots modifier-rail-joker-slots">
          {run.jokers.slice(0, JOKER_SLOT_LIMIT).map((joker) => {
            const definition = JOKER_CATALOG[joker.jokerId];
            const key = `joker-${joker.instanceId}`;
            const tooltipId = `${reactId}-${safeId(key)}-tooltip`;
            const effects = appliedJokerEffects.filter(
              (effect) => effect.sourceId === joker.jokerId,
            );
            const isCurrent = scoreEvent?.sourceKind === "mod"
              && scoreEvent.sourceEffectId === joker.jokerId;
            const isApplied = scoreEvent ? isCurrent : effects.length > 0;
            const isOpen = openTooltip === key;
            const statusLabel = isApplied ? "이번 핸드 적용됨" : "이번 핸드 미적용";

            return (
              <article
                className={`modifier-rail-slot modifier-rail-joker-slot modifier-rail-rarity-${definition.rarity}${isApplied ? " modifier-rail-slot-applied" : ""}${isCurrent ? " modifier-rail-slot-current" : ""}${isOpen ? " modifier-rail-slot-open" : ""}`}
                key={joker.instanceId}
                onMouseEnter={() => showTooltip(key)}
                onMouseLeave={(event) => {
                  if (!event.currentTarget.contains(event.currentTarget.ownerDocument.activeElement)) {
                    hideTooltip(key);
                  }
                }}
              >
                <button
                  type="button"
                  className="modifier-rail-slot-trigger"
                  aria-label={`${definition.name}, ${RARITY_LABELS[definition.rarity]}, ${jokerCondition(joker)}, ${statusLabel}`}
                  aria-describedby={tooltipId}
                  aria-controls={tooltipId}
                  aria-expanded={isOpen}
                  onFocus={() => showTooltip(key)}
                  onBlur={() => hideTooltip(key)}
                  onPointerDown={(event) => {
                    pointerOpenedTooltip.current = event.pointerType !== "mouse" && openTooltip === key ? key : null;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      hideTooltip(key);
                    } else if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setOpenTooltip((current) => current === key ? null : key);
                    }
                  }}
                  onClick={() => {
                    if (pointerOpenedTooltip.current === key) hideTooltip(key);
                    else showTooltip(key);
                    pointerOpenedTooltip.current = null;
                  }}
                >
                  <span className="modifier-rail-slot-icon" aria-hidden="true">
                    {JOKER_ICONS[joker.jokerId]}
                  </span>
                  <span className="modifier-rail-slot-copy">
                    <strong>{definition.name}</strong>
                    <small>{jokerLevel(joker)}</small>
                  </span>
                  <i className="modifier-rail-slot-status" aria-hidden="true">
                    {isApplied ? "적용" : "—"}
                  </i>
                </button>

                <div
                  className="modifier-rail-tooltip"
                  id={tooltipId}
                  role="tooltip"
                  hidden={!isOpen}
                >
                  <header className="modifier-rail-tooltip-header">
                    <span aria-hidden="true">{JOKER_ICONS[joker.jokerId]}</span>
                    <div>
                      <strong>{definition.name}</strong>
                      <small>{RARITY_LABELS[definition.rarity]} MOD</small>
                    </div>
                  </header>
                  <p className="modifier-rail-tooltip-description">{definition.description}</p>
                  <dl className="modifier-rail-tooltip-meta">
                    <div>
                      <dt>현재 조건</dt>
                      <dd>{jokerCondition(joker)}</dd>
                    </div>
                    <div>
                      <dt>이번 핸드</dt>
                      <dd>{statusLabel}</dd>
                    </div>
                  </dl>
                  {effects.length > 0 && (
                    <ul className="modifier-rail-tooltip-effects">
                      {effects.map((effect, index) => (
                        <li key={`${effect.sourceId}-${index}`}>
                          <span>{mayhemCopy(effect.description)}</span>
                          <b>{effectValue(effect)}</b>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            );
          })}

          {Array.from(
            { length: Math.max(0, JOKER_SLOT_LIMIT - run.jokers.length) },
            (_, index) => (
              <div
                className="modifier-rail-slot modifier-rail-empty-slot"
                role="img"
                aria-label={`빈 MOD 슬롯 ${run.jokers.length + index + 1}`}
                key={`empty-joker-${index}`}
              >
                <span aria-hidden="true">+</span>
                <small>빈 슬롯</small>
              </div>
            ),
          )}
        </div>
      </section>

      <section className="modifier-rail-section" aria-labelledby={`${reactId}-uno-title`}>
        <header className="modifier-rail-section-header">
          <h2 id={`${reactId}-uno-title`}>메이헴 카드</h2>
          <span>{run.communityUno.length}/{UNO_SLOT_LIMIT}</span>
        </header>
        <div className="modifier-rail-slots modifier-rail-uno-slots">
          {run.communityUno.slice(0, UNO_SLOT_LIMIT).map((card) => {
            const key = `uno-${card.id}`;
            const tooltipId = `${reactId}-${safeId(key)}-tooltip`;
            const isApplied = appliedUno?.cardId === card.id;
            const isOpen = openTooltip === key;
            const points = unoPointTotal(card);
            const condition = run.unoUsedThisAnte
              ? "이번 앤티 사용 완료"
              : "사용 가능 · 앤티당 1회";
            const statusLabel = isApplied ? "이번 핸드 적용됨" : "이번 핸드 미적용";
            const appliedModuleIds = new Set(
              isApplied ? appliedUno.appliedEffects.map((effect) => effect.sourceId) : [],
            );

            return (
              <article
                className={`modifier-rail-slot modifier-rail-uno-slot${isApplied ? " modifier-rail-slot-applied" : ""}${run.unoUsedThisAnte ? " modifier-rail-slot-used" : ""}${isOpen ? " modifier-rail-slot-open" : ""}`}
                key={card.id}
                onMouseEnter={() => showTooltip(key)}
                onMouseLeave={(event) => {
                  if (!event.currentTarget.contains(event.currentTarget.ownerDocument.activeElement)) {
                    hideTooltip(key);
                  }
                }}
              >
                <button
                  type="button"
                  className="modifier-rail-slot-trigger"
                  aria-label={`${card.name}, 커뮤니티 효과 카드 버전 ${card.version}, 균형 ${points}점, ${condition}, ${statusLabel}`}
                  aria-describedby={tooltipId}
                  aria-controls={tooltipId}
                  aria-expanded={isOpen}
                  onFocus={() => showTooltip(key)}
                  onBlur={() => hideTooltip(key)}
                  onPointerDown={(event) => {
                    pointerOpenedTooltip.current = event.pointerType !== "mouse" && openTooltip === key ? key : null;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      hideTooltip(key);
                    } else if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setOpenTooltip((current) => current === key ? null : key);
                    }
                  }}
                  onClick={() => {
                    if (pointerOpenedTooltip.current === key) hideTooltip(key);
                    else showTooltip(key);
                    pointerOpenedTooltip.current = null;
                  }}
                >
                  <span className="modifier-rail-slot-icon" aria-hidden="true">M</span>
                  <span className="modifier-rail-slot-copy">
                    <strong>{card.name}</strong>
                    <small>버전 {card.version} · {points > 0 ? "+" : ""}{points}</small>
                  </span>
                  <i className="modifier-rail-slot-status" aria-hidden="true">
                    {isApplied ? "적용" : run.unoUsedThisAnte ? "사용함" : "1회"}
                  </i>
                </button>

                <div
                  className="modifier-rail-tooltip"
                  id={tooltipId}
                  role="tooltip"
                  hidden={!isOpen}
                >
                  <header className="modifier-rail-tooltip-header">
                    <span aria-hidden="true">M</span>
                    <div>
                      <strong>{card.name}</strong>
                      <small>{card.author} · 버전 {card.version}</small>
                    </div>
                  </header>
                  <p className="modifier-rail-tooltip-description">
                    긍정 효과와 페널티를 합해 {points}점으로 균형을 맞춘 커뮤니티 카드입니다.
                  </p>
                  <dl className="modifier-rail-tooltip-meta">
                    <div>
                      <dt>현재 조건</dt>
                      <dd>{condition}</dd>
                    </div>
                    <div>
                      <dt>이번 핸드</dt>
                      <dd>{statusLabel}</dd>
                    </div>
                  </dl>
                  <ul className="modifier-rail-tooltip-modules">
                    {moduleIds(card).map((moduleId) => {
                      const moduleDefinition = UNO_MODULE_CATALOG[moduleId];
                      const moduleApplied = appliedModuleIds.has(moduleId);
                      return (
                        <li
                          className={`modifier-rail-module modifier-rail-module-${moduleDefinition.kind}${moduleApplied ? " modifier-rail-module-applied" : ""}`}
                          key={moduleId}
                        >
                          <b>{signed(moduleDefinition.points)} · {moduleDefinition.name}</b>
                          <span>{mayhemCopy(moduleDefinition.description)}</span>
                          {isApplied && <i>{moduleApplied ? "적용" : "조건 불충족"}</i>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </article>
            );
          })}

          {Array.from(
            { length: Math.max(0, UNO_SLOT_LIMIT - run.communityUno.length) },
            (_, index) => (
              <div
                className="modifier-rail-slot modifier-rail-empty-slot modifier-rail-empty-uno-slot"
                role="img"
                aria-label={`빈 커뮤니티 효과 카드 슬롯 ${run.communityUno.length + index + 1}`}
                key={`empty-uno-${index}`}
              >
                <span aria-hidden="true">M</span>
                <small>빈 슬롯</small>
              </div>
            ),
          )}
        </div>
      </section>

      <section className="modifier-rail-summary" aria-live="polite" aria-label="이번 핸드 적용 효과 요약">
        <header className="modifier-rail-summary-header">
          <span>제출 결과</span>
          <strong>{breakdown ? `효과 ${appliedCount}개` : "비공개"}</strong>
        </header>
        {!breakdown && (
          <p className="modifier-rail-summary-empty">카드를 내면 적용 결과를 표시합니다.</p>
        )}
        {breakdown && appliedCount === 0 && (
          <p className="modifier-rail-summary-empty">현재 조건을 만족한 효과가 없습니다.</p>
        )}
        {breakdown && appliedCount > 0 && (
          <ul className="modifier-rail-summary-effects">
            {appliedJokerEffects.map((effect, index) => (
              <li key={`joker-effect-${effect.sourceId}-${index}`}>
                <span className="modifier-rail-summary-effect-icon" aria-hidden="true">J</span>
                <span>
                  <b>{effect.sourceName}</b>
                  <small>{mayhemCopy(effect.description)}</small>
                </span>
                <strong>{effectValue(effect)}</strong>
              </li>
            ))}
            {appliedUno && (
              <li className="modifier-rail-summary-uno-effect">
                <span className="modifier-rail-summary-effect-icon" aria-hidden="true">M</span>
                <span>
                  <b>{appliedUno.cardName}</b>
                  <small>{COLOR_LABELS[appliedUno.calledColor]} 호출</small>
                </span>
                <strong>{signed(appliedUno.scoreAfterUno - appliedUno.scoreBeforeUno)}</strong>
              </li>
            )}
          </ul>
        )}
      </section>
    </aside>
  );
}
