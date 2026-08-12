"use client";

import { useId, useState } from "react";

import {
  CARD_COLORS,
  JOKER_CATALOG,
  UNO_MODULE_CATALOG,
  UNO_SLOT_LIMIT,
} from "../../lib/game/constants";
import { COLOR_IDENTITIES, COLOR_LABELS } from "../../lib/game/colors";
import { jokerSlotLimitFor } from "../../lib/game/run-upgrades";
import { JOKER_ART, MAYHEM_CARD_ART } from "../../lib/game/special-card-art";
import type {
  AppliedEffect,
  CardColor,
  CommunityUnoCard,
  JokerId,
  JokerInstance,
  RunState,
  ScoreBreakdown,
  StashedMayhemItem,
  UnoModuleId,
} from "../../lib/game/types";
import type { ScoreEvent } from "../../lib/game/score-events";

const RARITY_LABELS = {
  common: "STANDARD",
  uncommon: "UNCOMMON",
  rare: "RARE",
} as const;

export interface ModifierRailProps {
  run: RunState;
  /** The hand currently resolving, or the most recently resolved hand. */
  breakdown?: ScoreBreakdown | null;
  scoreEvent?: ScoreEvent | null;
  selectedUnoId?: string | null;
  calledColor?: CardColor;
  /** Second Color Call, only shown/used for cards carrying the double-call module. */
  calledColorTwo?: CardColor;
  disabled?: boolean;
  onSelectUno?: (id: string | null) => void;
  onCallColor?: (color: CardColor) => void;
  onCallColorTwo?: (color: CardColor) => void;
  /** Shown as a sell action in the MOD tooltip; only meaningful during the shop phase. */
  onSellJoker?: (instanceId: string) => void;
  onUseStashedItem?: (instanceId: string) => void;
  onSellStashedItem?: (instanceId: string) => void;
  /** Controlled by the run shell so a shop selection closes a pinned MOD detail. */
  selectedDetailKey?: string | null;
  onSelectedDetailChange?: (key: string | null) => void;
  className?: string;
}

function jokerSellRefund(jokerId: JokerId): number {
  return Math.max(1, Math.floor(JOKER_CATALOG[jokerId].price / 2));
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
  switch (joker.jokerId) {
    case "combo-compiler":
      return `연속 스택: ${joker.counter ?? 0}/4`;
    case "runner-process":
      return `누적 POWER: +${joker.counter ?? 0}`;
    case "spare-trousers":
    case "green-demon":
      return `누적 HYPE: +${joker.counter ?? 0}`;
    case "loyalty-session":
      return `누적 핸드: ${joker.counter ?? 0}`;
    case "ice-cream-cache":
      return `남은 POWER: ${joker.counter ?? 0}`;
    case "turtle-bean-cache":
      return `남은 라운드: ${joker.counter ?? 0}`;
    default:
      if (joker.selectedColor) return `선택 색상: ${COLOR_LABELS[joker.selectedColor]}`;
      return `획득 라운드: ${joker.acquiredRound}`;
  }
}

function isUnoCard(item: StashedMayhemItem): item is CommunityUnoCard {
  return Boolean(item) && "positiveModules" in item && Array.isArray(item.positiveModules);
}

function moduleIds(card: CommunityUnoCard): readonly UnoModuleId[] {
  return [...(card.positiveModules ?? []), ...(card.negativeModules ?? [])];
}

function unoPointTotal(card: CommunityUnoCard): number {
  return moduleIds(card).reduce(
    (total, moduleId) => total + UNO_MODULE_CATALOG[moduleId].points,
    0,
  );
}

export function ModifierRail({
  run,
  breakdown,
  scoreEvent,
  selectedUnoId = null,
  calledColor = "red",
  calledColorTwo = "blue",
  disabled = false,
  onSelectUno,
  onCallColor,
  onCallColorTwo,
  onSellJoker,
  onUseStashedItem,
  onSellStashedItem,
  selectedDetailKey,
  onSelectedDetailChange,
  className,
}: ModifierRailProps) {
  const reactId = safeId(useId());
  const [hoveredTooltip, setHoveredTooltip] = useState<string | null>(null);
  const [uncontrolledSelectedTooltip, setUncontrolledSelectedTooltip] = useState<string | null>(null);
  const selectedTooltip = onSelectedDetailChange ? selectedDetailKey ?? null : uncontrolledSelectedTooltip;
  const jokerLimit = jokerSlotLimitFor(run);
  const appliedJokerEffects = breakdown?.appliedJokers ?? [];
  const appliedUno = breakdown?.uno;
  const outerClassName = ["modifier-rail-root", className].filter(Boolean).join(" ");

  const showTooltip = (key: string) => setHoveredTooltip(key);
  const hideTooltip = (key: string) => {
    setHoveredTooltip((current) => (current === key ? null : current));
  };
  const toggleSelectedTooltip = (key: string) => {
    const next = selectedTooltip === key ? null : key;
    if (onSelectedDetailChange) onSelectedDetailChange(next);
    else setUncontrolledSelectedTooltip(next);
    setHoveredTooltip(null);
  };
  const clearSelectedTooltip = (key: string) => {
    if (selectedTooltip === key) {
      if (onSelectedDetailChange) onSelectedDetailChange(null);
      else setUncontrolledSelectedTooltip(null);
    }
    setHoveredTooltip(null);
  };

  return (
    <aside className={outerClassName} aria-label="보유 효과와 이번 핸드 적용 상태">
      <section className="modifier-rail-section" aria-labelledby={`${reactId}-jokers-title`}>
        <header className="modifier-rail-section-header">
          <h2 id={`${reactId}-jokers-title`}>MOD</h2>
          <span>{run.jokers.length}/{jokerLimit}</span>
        </header>
        <div className="modifier-rail-slots modifier-rail-joker-slots">
          {run.jokers.slice(0, jokerLimit).map((joker) => {
            const definition = JOKER_CATALOG[joker.jokerId];
            const key = `joker-${joker.instanceId}`;
            const tooltipId = `${reactId}-${safeId(key)}-tooltip`;
            const effects = appliedJokerEffects.filter(
              (effect) => effect.sourceId === joker.jokerId,
            );
            const isCurrent = scoreEvent?.sourceKind === "mod"
              && scoreEvent.sourceEffectId === joker.jokerId;
            const isApplied = scoreEvent ? isCurrent : effects.length > 0;
            const isSelected = selectedTooltip === key;
            const isOpen = isSelected || (selectedTooltip === null && hoveredTooltip === key);
            const statusLabel = isApplied ? "이번 핸드 적용됨" : "이번 핸드 미적용";

            return (
              <article
                className={`modifier-rail-slot modifier-rail-joker-slot modifier-rail-rarity-${definition.rarity}${isApplied ? " modifier-rail-slot-applied" : ""}${isCurrent ? " modifier-rail-slot-current" : ""}${isOpen ? " modifier-rail-slot-open" : ""}${isSelected ? " modifier-rail-slot-selected" : ""}`}
                key={joker.instanceId}
                onMouseEnter={() => showTooltip(key)}
                onMouseLeave={() => hideTooltip(key)}
              >
                <button
                  type="button"
                  className="modifier-rail-slot-trigger"
                  aria-label={`${definition.name}, ${RARITY_LABELS[definition.rarity]}, ${jokerCondition(joker)}, ${statusLabel}`}
                  aria-describedby={tooltipId}
                  aria-controls={tooltipId}
                  aria-expanded={isSelected}
                  onFocus={() => showTooltip(key)}
                  onBlur={(event) => {
                    // Moving focus into this same tooltip (e.g. the sell button)
                    // isn't "leaving" it — only close the transient preview.
                    const next = event.relatedTarget;
                    if (next && event.currentTarget.parentElement?.contains(next)) return;
                    hideTooltip(key);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      clearSelectedTooltip(key);
                    } else if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleSelectedTooltip(key);
                    }
                  }}
                  onClick={() => toggleSelectedTooltip(key)}
                >
                  <span className="modifier-rail-slot-icon" aria-hidden="true">
                    <img className="special-card-art" src={JOKER_ART[joker.jokerId]} alt="" />
                  </span>
                </button>

                <div
                  className="modifier-rail-tooltip"
                  id={tooltipId}
                  role="tooltip"
                  hidden={!isOpen}
                >
                  <header className="modifier-rail-tooltip-header">
                    <span aria-hidden="true"><img className="special-card-art" src={JOKER_ART[joker.jokerId]} alt="" /></span>
                    <div>
                      <strong>{definition.name}</strong>
                      <small>{RARITY_LABELS[definition.rarity]} MOD</small>
                    </div>
                  </header>
                  <p className="modifier-rail-tooltip-description">{definition.description}</p>
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
                  {run.phase === "shop" && onSellJoker && (
                    <button
                      type="button"
                      className="modifier-rail-tooltip-sell"
                      onClick={(event) => {
                        event.stopPropagation();
                        clearSelectedTooltip(key);
                        onSellJoker(joker.instanceId);
                      }}
                    >
                      판매 +{jokerSellRefund(joker.jokerId)}¢
                    </button>
                  )}
                </div>
              </article>
            );
          })}

        </div>
      </section>

      <section className="modifier-rail-section" aria-labelledby={`${reactId}-uno-title`}>
        <header className="modifier-rail-section-header">
          <h2 id={`${reactId}-uno-title`}>MAYHEM CARDS</h2>
          <span>{run.communityUno.length}/{UNO_SLOT_LIMIT}</span>
        </header>
        <div className="modifier-rail-slots modifier-rail-uno-slots">
          {run.communityUno.slice(0, UNO_SLOT_LIMIT).map((item) => {
            if (!isUnoCard(item)) {
              const refund = Math.max(1, Math.floor(item.price / 2));
              const isGhost = item.kind === "ghost";
              return (
                <article
                  className="modifier-rail-slot modifier-rail-uno-slot"
                  key={item.id}
                  style={{ borderColor: "#00e5ff", background: "rgba(0, 229, 255, 0.12)", padding: "4px", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center" }}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
                    <b style={{ color: isGhost ? "#c084fc" : "#00e5ff", fontSize: "0.72rem" }}>[{isGhost ? "GHOST" : "LV+"}] {item.name}</b>
                    <small style={{ fontSize: "0.6rem", color: "#ccc" }}>{isGhost ? "사용 시 고스트 효과 발동" : "보관 중"}</small>
                  </div>
                  <div style={{ display: "flex", gap: "3px", justifyContent: "center", width: "100%", marginTop: "2px" }}>
                    {onUseStashedItem && (
                      <button
                        type="button"
                        style={{ padding: "2px 6px", fontSize: "0.7rem", background: "#00e5ff", color: "#000", fontWeight: "bold", border: "none", borderRadius: "3px", cursor: "pointer" }}
                        onClick={() => onUseStashedItem(item.id)}
                      >
                        사용
                      </button>
                    )}
                    {onSellStashedItem && run.phase === "shop" && (
                      <button
                        type="button"
                        style={{ padding: "2px 6px", fontSize: "0.7rem", background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid #666", borderRadius: "3px", cursor: "pointer" }}
                        onClick={() => onSellStashedItem(item.id)}
                      >
                        +{refund}¢
                      </button>
                    )}
                  </div>
                </article>
              );
            }
            const card = item;
            const key = `uno-${card.id}`;
            const tooltipId = `${reactId}-${safeId(key)}-tooltip`;
            const isApplied = appliedUno?.cardId === card.id;
            const isArmed = selectedUnoId === card.id;
            const isSelected = selectedTooltip === key;
            const isOpen = isSelected || (selectedTooltip === null && hoveredTooltip === key);
            const points = unoPointTotal(card);
            const condition = run.unoUsedThisAnte
              ? "이번 스테이지 사용 완료"
              : "사용 가능 · 스테이지당 1회";
            const statusLabel = isApplied
              ? "이번 핸드 적용됨"
              : isArmed
                ? `이번 핸드 준비 · ${COLOR_IDENTITIES[calledColor].koreanColor}${
                    card.positiveModules.includes("double-call")
                      ? ` + ${COLOR_IDENTITIES[calledColorTwo].koreanColor}`
                      : ""
                  }`
                : "이번 핸드 미적용";
            const appliedModuleIds = new Set(
              isApplied ? appliedUno.appliedEffects.map((effect) => effect.sourceId) : [],
            );
            const visibleModuleSummary = moduleIds(card)
              .slice(0, 2)
              .map((moduleId) => {
                const moduleDefinition = UNO_MODULE_CATALOG[moduleId];
                return `${signed(moduleDefinition.points)} ${moduleDefinition.name}`;
              })
              .join(" · ");

            return (
              <article
                className={`modifier-rail-slot modifier-rail-uno-slot${isApplied ? " modifier-rail-slot-applied" : ""}${isArmed ? " modifier-rail-slot-armed" : ""}${run.unoUsedThisAnte ? " modifier-rail-slot-used" : ""}${isOpen ? " modifier-rail-slot-open" : ""}${isSelected ? " modifier-rail-slot-selected" : ""}`}
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
                  aria-expanded={isSelected}
                  onFocus={() => showTooltip(key)}
                  onBlur={() => hideTooltip(key)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      clearSelectedTooltip(key);
                    } else if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleSelectedTooltip(key);
                    }
                  }}
                  onClick={() => toggleSelectedTooltip(key)}
                >
                  <span className="modifier-rail-slot-icon" aria-hidden="true"><img className="special-card-art" src={MAYHEM_CARD_ART} alt="" /></span>
                  <span className="modifier-rail-slot-copy modifier-rail-mayhem-copy">
                    <strong>{card.name}</strong>
                    <small>{visibleModuleSummary || "효과 없음"}</small>
                  </span>
                </button>

                <div
                  className="modifier-rail-tooltip"
                  id={tooltipId}
                  role="tooltip"
                  hidden={!isOpen}
                >
                  <header className="modifier-rail-tooltip-header">
                    <span aria-hidden="true"><img className="special-card-art" src={MAYHEM_CARD_ART} alt="" /></span>
                    <div>
                      <strong>{card.name}</strong>
                      <small>{card.author} · 버전 {card.version}</small>
                    </div>
                  </header>
                  <p className="modifier-rail-tooltip-description">
                    긍정 효과와 페널티를 합해 {points}점으로 균형을 맞춘 커뮤니티 카드입니다.
                  </p>
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
                  {!run.unoUsedThisAnte && (
                    <div className="modifier-rail-mayhem-actions">
                      <span>호출 색상</span>
                      <div className="modifier-rail-mayhem-colors" role="group" aria-label="메이헴 호출 색상">
                        {CARD_COLORS.map((color) => (
                          <button
                            type="button"
                            key={color}
                            className={`is-${color}${calledColor === color ? " is-active" : ""}`}
                            aria-label={`${COLOR_IDENTITIES[color].koreanColor} 호출`}
                            aria-pressed={calledColor === color}
                            disabled={disabled}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => onCallColor?.(color)}
                          >
                            {COLOR_IDENTITIES[color].short}
                          </button>
                        ))}
                      </div>
                      {card.positiveModules.includes("double-call") && (
                        <>
                          <span>추가 호출 색상 (더블 콜)</span>
                          <div className="modifier-rail-mayhem-colors" role="group" aria-label="메이헴 추가 호출 색상">
                            {CARD_COLORS.map((color) => (
                              <button
                                type="button"
                                key={color}
                                className={`is-${color}${calledColorTwo === color ? " is-active" : ""}`}
                                aria-label={`${COLOR_IDENTITIES[color].koreanColor} 추가 호출`}
                                aria-pressed={calledColorTwo === color}
                                disabled={disabled}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => onCallColorTwo?.(color)}
                              >
                                {COLOR_IDENTITIES[color].short}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      <button
                        type="button"
                        className={`modifier-rail-mayhem-use${isArmed ? " is-cancel" : ""}`}
                        disabled={disabled}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onSelectUno?.(isArmed ? null : card.id)}
                      >
                        {isArmed ? "사용 취소" : "이번 핸드에 사용"}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}

        </div>
      </section>
    </aside>
  );
}
