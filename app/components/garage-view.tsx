"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import {
  effectiveHandChips,
  effectiveHandMultiplier,
  HAND_RULES,
  JOKER_CATALOG,
  UNO_SLOT_LIMIT,
} from "../../lib/game/constants";
import {
  CARD_ENHANCEMENT_CONFIG,
  CARD_PACK_CONFIG,
  DECK_WORK_CONFIG,
  FIRMWARE_CONFIG,
  GHOST_CONFIG,
  MINIMUM_RUN_DECK_SIZE,
  PROTOCOL_CONFIG,
} from "../../lib/game/garage-config";
import { COLOR_LABELS } from "../../lib/game/colors";
import { PACK_DEFINITIONS } from "../../lib/game/packs";
import { jokerSlotLimitFor } from "../../lib/game/run-upgrades";
import { JOKER_ART, MAYHEM_CARD_ART } from "../../lib/game/special-card-art";
import type {
  CardColor,
  CardRarity,
  DeckWorkShopOffer,
  GameCard,
  PackChoice,
  PackOpening,
  RunState,
  ShopOffer,
  UseConsumableOptions,
} from "../../lib/game/types";
import { DeckCardGrid } from "./deck-card-grid";

const RARITY_LABELS: Readonly<Record<CardRarity, string>> = {
  common: "COMMON",
  uncommon: "UNCOMMON",
  rare: "RARE",
  legendary: "LEGENDARY",
};

const ROUND_LABELS: Readonly<Record<RunState["round"], string>> = {
  small: "WARM-UP",
  big: "BREAKPOINT",
  boss: "MAYHEM ROUND",
};

type OfferPresentation = {
  readonly name: string;
  readonly effect: string;
  readonly detail: string;
  readonly category: string;
  readonly rarity: CardRarity;
  readonly symbol: string;
  readonly artSrc?: string;
  readonly meta: string;
  readonly disabledReason?: string;
};

export interface GarageViewProps {
  readonly run: RunState;
  readonly embedded?: boolean;
  readonly notice?: string;
  readonly onBuy: (offer: ShopOffer, options?: UseConsumableOptions) => RunState | null | void;
  readonly onReroll: () => void;
  readonly onNext: () => void;
  readonly onSelectDeckTarget: (offer: DeckWorkShopOffer, card: GameCard) => void;
  readonly onTakePack: (
    opening: PackOpening,
    choiceIds: readonly string[],
    targetCardId?: string | readonly string[],
    targetColor?: CardColor,
  ) => RunState | null | void;
  /** Close an already purchased pack without taking a reward. */
  readonly onSkipPack: (opening: PackOpening) => RunState | null | void;
  readonly onPackOpen: () => void;
  readonly onPackReveal: (index: number) => void;
  /** Shared by the run shell with the top MOD / MAYHEM rack. */
  readonly selectedDetailKey?: string | null;
  readonly onSelectedDetailChange?: (key: string | null) => void;
}

function normalizeTerminology(value: string): string {
  return value
    .replaceAll("조커", "MOD")
    .replaceAll("패턴", "족보")
    .replaceAll("칩", "POWER")
    .replaceAll("배수", "HYPE")
    .replaceAll("앤티", "STAGE");
}

function uniqueDeckCards(run: RunState): readonly GameCard[] {
  const source = run.deck ?? [...run.hand, ...run.drawPile, ...run.discardPile];
  const cards = new Map<string, GameCard>();
  source.forEach((card) => cards.set(card.id, card));
  const colorOrder: readonly GameCard["color"][] = ["red", "yellow", "green", "blue"];
  return [...cards.values()].sort(
    (left, right) => colorOrder.indexOf(left.color) - colorOrder.indexOf(right.color) || right.rank - left.rank,
  );
}

function nextTargetLabel(run: RunState): string {
  if (run.round === "small") return "BREAKPOINT";
  if (run.round === "big") return "MAYHEM ROUND";
  return `STAGE ${run.ante + 1}`;
}

function modifierRarity(jokerId: Extract<ShopOffer, { kind: "joker" }>["jokerId"]): CardRarity {
  if (jokerId === "null-pointer") return "legendary";
  return JOKER_CATALOG[jokerId].rarity;
}

function offerPresentation(offer: ShopOffer, run: RunState): OfferPresentation {
  const shortfall = Math.max(0, offer.price - run.coins);
  let disabledReason = shortfall > 0 ? `${shortfall}¢ 부족` : undefined;
  const jokerLimit = jokerSlotLimitFor(run);

  if (offer.kind === "joker") {
    const definition = JOKER_CATALOG[offer.jokerId];
    if (run.jokers.some((joker) => joker.jokerId === offer.jokerId)) {
      disabledReason = "이미 장착한 MOD";
    } else if (run.jokers.length >= jokerLimit) {
      disabledReason = "MOD 슬롯 가득 참";
    }
    return {
      category: "MODIFIER",
      rarity: modifierRarity(offer.jokerId),
      name: definition.name,
      effect: normalizeTerminology(definition.description),
      detail: `런 동안 모든 핸드에 적용 · ${run.jokers.length}/${jokerLimit} 슬롯 사용 중`,
      symbol: definition.name.slice(0, 1),
      artSrc: JOKER_ART[offer.jokerId],
      meta: `PASSIVE MOD · ${definition.price}¢ VALUE`,
      disabledReason,
    };
  }

  if (offer.kind === "protocol") {
    const protocol = PROTOCOL_CONFIG[offer.protocolId];
    return {
      category: "PROTOCOL",
      rarity: "uncommon",
      name: protocol.name,
      effect: normalizeTerminology(protocol.description),
      detail: "선택 즉시 덱 조작 적용 · 대상 카드 선택 필요",
      symbol: protocol.symbol,
      meta: "SINGLE-USE PROTOCOL",
      disabledReason,
    };
  }

  if (offer.kind === "firmware") {
    const firmware = FIRMWARE_CONFIG[offer.firmwareId];
    const installed = (run.firmware ?? []).filter((firmwareId) => firmwareId === offer.firmwareId).length;
    if (installed >= firmware.maxStacks) disabledReason = "최대 설치 완료";
    return {
      category: "FIRMWARE",
      rarity: installed > 0 ? "rare" : "uncommon",
      name: firmware.name,
      effect: normalizeTerminology(firmware.description),
      detail: `런 종료까지 유지 · 현재 ${installed}/${firmware.maxStacks} 설치`,
      symbol: firmware.symbol,
      meta: "PERMANENT RUN UPGRADE",
      disabledReason,
    };
  }

  if (offer.kind === "deck-work") {
    const work = DECK_WORK_CONFIG[offer.work];
    const deckSize = uniqueDeckCards(run).length;
    if (offer.work === "remove" && deckSize <= MINIMUM_RUN_DECK_SIZE) {
      disabledReason = `덱 최소 ${MINIMUM_RUN_DECK_SIZE}장`;
    }
    return {
      category: "DECK LAB",
      rarity: offer.work === "remove" || offer.work === "clone" ? "rare" : "uncommon",
      name: work.name,
      effect: normalizeTerminology(work.description),
      detail: offer.targetColor
        ? `${COLOR_LABELS[offer.targetColor]} 채널로 재배선 · 대상 카드 선택 필요`
        : `현재 런 덱 ${deckSize}장 · 대상 카드 선택 필요`,
      symbol: work.symbol,
      meta: "ONE-SHOT DECK WORK",
      disabledReason,
    };
  }

  if (offer.kind === "card-pack") {
    const pack = CARD_PACK_CONFIG[offer.packKind];
    const definition = PACK_DEFINITIONS[offer.packKind];
    if (
      definition.contents === "modifier" &&
      run.jokers.length + definition.pickCount > jokerLimit
    ) {
      disabledReason = "MOD 슬롯 부족";
    }
    if (
      definition.contents === "upgrade" &&
      !uniqueDeckCards(run).some((card) => !card.enhancement)
    ) {
      disabledReason = "강화할 기본 카드 없음";
    }
    return {
      category: "BOOSTER PACK",
      rarity: offer.packKind === "premium" || offer.packKind === "glitch"
        ? "legendary"
        : offer.packKind === "large" || offer.packKind === "modifier"
          ? "rare"
          : "uncommon",
      name: pack.name,
      effect: normalizeTerminology(pack.description),
      detail: `${definition.revealCount}개 공개 · ${definition.pickCount}개 선택 · 중복 없는 가중 추첨`,
      symbol: pack.symbol,
      artSrc: pack.artSrc,
      meta: `${definition.contents.toUpperCase()} POOL`,
      disabledReason,
    };
  }

  if (offer.kind === "hand-upgrade") {
    const rule = HAND_RULES[offer.handType];
    const level = run.handLevels[offer.handType];
    const currentChips = effectiveHandChips(rule, level);
    const nextChips = effectiveHandChips(rule, level + 1);
    const currentMultiplier = effectiveHandMultiplier(rule, level);
    const nextMultiplier = effectiveHandMultiplier(rule, level + 1);
    return {
      category: "족보 CORE",
      rarity: level >= 4 ? "rare" : "uncommon",
      name: rule.name,
      effect: `Lv.${level} → Lv.${level + 1} · POWER ${currentChips}→${nextChips} · HYPE ${currentMultiplier}→${nextMultiplier}`,
      detail: "구매 즉시 레벨이 오르며, 이 런 동안 영구 적용됩니다.",
      symbol: "▲",
      meta: `CURRENT LEVEL ${level}`,
      disabledReason,
    };
  }

  const alreadyOwned = run.communityUno.some((card) => card.id === offer.card.id);
  if (alreadyOwned) disabledReason = "이미 보유한 규칙";
  else if (run.communityUno.length >= UNO_SLOT_LIMIT) disabledReason = "MAYHEM 슬롯 가득 참";
  return {
    category: "⚠ SIGNAL HIJACK · MAYHEM",
    rarity: "rare",
    name: offer.card.name,
    effect: `${offer.card.author} 제작 · 긍정/결함 예산 0의 한 턴 규칙`,
    detail: `긍정 ${offer.card.positiveModules.length} · 결함 ${offer.card.negativeModules.length} · 버전 ${offer.card.version}`,
    symbol: "M",
    artSrc: MAYHEM_CARD_ART,
    meta: `MAYHEM SLOT ${run.communityUno.length}/${UNO_SLOT_LIMIT}`,
    disabledReason,
  };
}

function targetDisabledReason(
  offer: DeckWorkShopOffer,
  card: GameCard,
  deckSize: number,
): string | null {
  if (offer.work === "remove" && deckSize <= MINIMUM_RUN_DECK_SIZE) return `최소 ${MINIMUM_RUN_DECK_SIZE}장`;
  if (offer.work === "shift-up" && card.rank === 9) return "9는 상승 불가";
  if (offer.work === "shift-down" && card.rank === 0) return "0은 하강 불가";
  if (offer.work === "recolor" && offer.targetColor === card.color) return "이미 같은 색";
  if ((offer.work === "charge" || offer.work === "amplify") && card.enhancement) return "이미 강화됨";
  return null;
}

function ShopSlot({
  offer,
  run,
  sold,
  selected,
  purchasing,
  onSelect,
  onBuy,
}: {
  readonly offer: ShopOffer;
  readonly run: RunState;
  readonly sold: boolean;
  readonly selected: boolean;
  readonly purchasing: boolean;
  readonly onSelect: () => void;
  readonly onBuy: () => void;
}) {
  const item = offerPresentation(offer, run);
  const unavailableReason = item.disabledReason ?? (run.coins < offer.price ? "코인 부족" : null);
  const disabled = Boolean(unavailableReason) || sold;
  const actionLabel = offer.kind === "card-pack"
    ? "팩 열기"
    : offer.kind === "deck-work" || (offer.kind === "protocol" && offer.protocolId !== "emergency-credit")
      ? "대상 선택"
      : "구매";
  return (
    <article
      className="dm-shop-slot"
      data-kind={offer.kind}
      data-rarity={item.rarity}
      data-selected={selected || undefined}
      data-sold={sold || undefined}
      data-purchasing={purchasing || undefined}
    >
      <button
        type="button"
        className="dm-shop-slot__select"
        disabled={sold}
        aria-pressed={selected}
        aria-label={`${item.name}, ${item.effect}, ${offer.price}코인${sold ? ", 판매 완료" : ""}`}
        onClick={(event) => {
          onSelect();
          // The second click releases the selected state.  It must also
          // release button focus; otherwise :focus-within keeps the hover
          // inspector visible after the pointer has left the card.
          if (selected) event.currentTarget.blur();
        }}
      >
        <span className="dm-shop-slot__rarity">{RARITY_LABELS[item.rarity]}</span>
        <span className={`dm-shop-slot__art${item.artSrc ? offer.kind === "card-pack" ? " is-pack-art" : " is-special-art" : ""}`} aria-hidden="true">
          {item.artSrc ? <img className={offer.kind === "card-pack" ? "dm-pack-art" : "special-card-art"} src={item.artSrc} alt="" /> : <><i /><b>{item.symbol}</b></>}
        </span>
        <span className="dm-shop-slot__copy">
          <small>{item.category}</small>
          <strong>{item.name}</strong>
          <span>{item.effect}</span>
        </span>
      </button>
      <div className="dm-shop-slot__detail" aria-label={`${item.name} 상세 정보`}>
        <strong>{item.name}</strong>
        <em>{item.effect}</em>
      </div>
      <footer>
        <span className={item.disabledReason ? "is-disabled" : ""}>
          {item.disabledReason ?? `${offer.price}¢`}
        </span>
      </footer>
      {selected && !sold && (
        <div className="dm-shop-slot__purchase">
          <button
            type="button"
            className="dm-shop-slot__buy"
            disabled={disabled || purchasing}
            onClick={onBuy}
          >
            {purchasing ? "구매 중…" : disabled ? unavailableReason : `${actionLabel} · ${offer.price}¢`}
          </button>
        </div>
      )}
      {sold && <div className="dm-shop-slot__sold" aria-label="판매 완료">SOLD</div>}
    </article>
  );
}

function EmptyShopSlot({
  eyebrow,
  message,
}: {
  readonly eyebrow: string;
  readonly message: string;
}) {
  return (
    <article className="dm-shop-slot dm-shop-slot--empty" aria-label={message}>
      <div className="dm-shop-slot__empty-mark" aria-hidden="true">×</div>
      <small>{eyebrow}</small>
      <strong>{message}</strong>
    </article>
  );
}

function DeckTargetOverlay({
  run,
  offer,
  onClose,
  onSelect,
}: {
  readonly run: RunState;
  readonly offer: DeckWorkShopOffer;
  readonly onClose: () => void;
  readonly onSelect: (card: GameCard) => void;
}) {
  const cards = uniqueDeckCards(run);
  return (
    <div className="dm-garage-overlay" role="dialog" aria-modal="true" aria-labelledby="dm-target-title">
      <section className="dm-garage-dialog dm-target-dialog">
        <header>
          <div><span>DECK LAB</span><h2 id="dm-target-title">{DECK_WORK_CONFIG[offer.work].name}</h2></div>
          <button type="button" onClick={onClose}>닫기</button>
        </header>
        <p>{normalizeTerminology(DECK_WORK_CONFIG[offer.work].description)}</p>
        <DeckCardGrid
          cards={cards}
          ariaLabel="덱 개조 대상 카드"
          disabledReason={(card) => targetDisabledReason(offer, card, cards.length)}
          onSelect={onSelect}
        />
      </section>
    </div>
  );
}

function ProtocolTargetOverlay({
  run,
  offer,
  onClose,
  onSelect,
}: {
  readonly run: RunState;
  readonly offer: Extract<ShopOffer, { kind: "protocol" }>;
  readonly onClose: () => void;
  readonly onSelect: (options: UseConsumableOptions) => void;
}) {
  const protocol = PROTOCOL_CONFIG[offer.protocolId];
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [targetColor, setTargetColor] = useState<CardColor | null>(null);
  const cards = uniqueDeckCards(run);
  const maximum = offer.protocolId === "channel-rewire" ? 3 : 1;
  const needsColor = offer.protocolId === "channel-rewire";

  function disabledReason(card: GameCard): string | null {
    if (selectedIds.includes(card.id)) return null;
    if (selectedIds.length >= maximum) return `최대 ${maximum}장`;
    if (offer.protocolId === "voltage-up" && card.rank === 9) return "9는 상승 불가";
    if (offer.protocolId === "voltage-down" && card.rank === 0) return "0은 하강 불가";
    if (offer.protocolId === "circuit-cut" && cards.length <= MINIMUM_RUN_DECK_SIZE) return `최소 ${MINIMUM_RUN_DECK_SIZE}장`;
    return null;
  }

  function handleCardSelect(card: GameCard) {
    if (disabledReason(card)) return;
    if (!needsColor && maximum === 1) {
      onSelect({ targetCardIds: [card.id] });
      return;
    }
    setSelectedIds((current) => current.includes(card.id)
      ? current.filter((id) => id !== card.id)
      : current.length < maximum ? [...current, card.id] : current);
  }

  const ready = selectedIds.length >= 1 && selectedIds.length <= maximum && (!needsColor || Boolean(targetColor));

  return (
    <div className="dm-garage-overlay" role="dialog" aria-modal="true" aria-labelledby="dm-protocol-target-title">
      <section className="dm-garage-dialog dm-utility-dialog" data-kind="protocol">
        <header>
          <div><span>PROTOCOL UPGRADE</span><h2 id="dm-protocol-target-title">{protocol.name}</h2></div>
          <button type="button" onClick={onClose}>취소</button>
        </header>
        <p>{normalizeTerminology(protocol.description)}</p>
        <p style={{ color: "#00e5ff", fontSize: "0.85rem", margin: "4px 0 10px 0" }}>
          {needsColor ? "변경할 색상과 카드를 선택한 후 적용 버튼을 누르세요." : "적용할 카드를 클릭하면 즉시 적용됩니다."}
        </p>
        {needsColor && (
          <div className="dm-utility-colors" data-has-selection={Boolean(targetColor)} role="group" aria-label="변경할 채널 색">
            {(["red", "yellow", "green", "blue"] as const).map((color) => {
              const isSelected = targetColor === color;
              return (
                <button
                  type="button"
                  data-color={color}
                  aria-pressed={isSelected}
                  key={color}
                  onClick={() => setTargetColor(color)}
                >
                  {COLOR_LABELS[color]} {isSelected ? "✓" : ""}
                </button>
              );
            })}
          </div>
        )}
        <DeckCardGrid
          cards={cards}
          ariaLabel={`${protocol.name} 대상 카드`}
          selectedIds={selectedIds}
          disabledReason={disabledReason}
          onSelect={handleCardSelect}
        />
        {needsColor && (
          <footer>
            <span>{selectedIds.length}/1–3장 선택 · {offer.price}¢</span>
            <button
              type="button"
              disabled={!ready}
              onClick={() => onSelect({ targetCardIds: selectedIds, ...(targetColor ? { targetColor } : {}) })}
            >
              구매 및 PROTOCOL 적용 ({offer.price}¢)
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

function choiceCopy(choice: PackChoice): {
  readonly name: string;
  readonly effect: string;
  readonly symbol: string;
  readonly artSrc?: string;
} {
  if (choice.kind === "card") {
    const enhancement = choice.card.enhancement
      ? CARD_ENHANCEMENT_CONFIG[choice.card.enhancement]
      : null;
    return {
      name: `${COLOR_LABELS[choice.card.color]} ${choice.card.rank}`,
      effect: enhancement?.description ?? "기본 숫자 카드",
      symbol: String(choice.card.rank),
    };
  }
  if (choice.kind === "modifier") {
    const definition = JOKER_CATALOG[choice.jokerId];
    return {
      name: definition.name,
      effect: normalizeTerminology(definition.description),
      symbol: definition.name.slice(0, 1),
      artSrc: JOKER_ART[choice.jokerId],
    };
  }
  if (choice.kind === "upgrade") {
    const enhancement = CARD_ENHANCEMENT_CONFIG[choice.enhancement];
    return { name: enhancement.name, effect: enhancement.description, symbol: choice.enhancement === "overclocked" ? "OC" : "UP" };
  }
  if (choice.kind === "core") {
    const rule = HAND_RULES[choice.handType];
    return {
      name: `${rule.name} CORE`,
      effect: `해당 족보 레벨당 POWER +${rule.chipGrowthPerLevel} · HYPE +${rule.multGrowthPerLevel}`,
      symbol: "▲",
    };
  }
  if (choice.kind === "protocol") {
    const protocol = PROTOCOL_CONFIG[choice.protocolId];
    return { name: protocol.name, effect: protocol.description, symbol: protocol.symbol };
  }
  const ghost = GHOST_CONFIG[choice.ghostId];
  return { name: ghost.name, effect: ghost.description, symbol: ghost.symbol };
}

function normalizedPackChoices(opening: PackOpening): readonly PackChoice[] {
  return opening.choices.map((choice) => {
    if ("kind" in choice) return choice;
    const legacyCard = choice as unknown as GameCard;
    return {
      id: legacyCard.id,
      kind: "card" as const,
      rarity: legacyCard.rarity ?? (legacyCard.enhancement ? "uncommon" : "common"),
      card: legacyCard,
    };
  });
}

function PackChoiceCard({
  choice,
  index,
  revealed,
  previewed,
  selected,
  disabled,
  onPreview,
  onConfirm,
}: {
  readonly choice: PackChoice;
  readonly index: number;
  readonly revealed: boolean;
  readonly previewed: boolean;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onPreview: () => void;
  readonly onConfirm: () => void;
}) {
  const copy = choiceCopy(choice);
  return (
    <div className="dm-pack-choice-tile" data-previewed={previewed || undefined}>
      <button
        type="button"
        className="dm-pack-choice"
        data-kind={choice.kind}
        data-rarity={choice.rarity}
        data-revealed={revealed || undefined}
        data-selected={selected || undefined}
        disabled={!revealed || disabled}
        style={{ "--reveal-index": index } as CSSProperties}
        aria-label={revealed ? `${copy.name}, ${copy.effect}${selected ? ", 선택됨" : ", 선택 미리보기"}` : `숨겨진 카드 ${index + 1}`}
        aria-pressed={revealed ? previewed : undefined}
        onClick={onPreview}
      >
        <span className="dm-pack-choice__back"><b>DECK<br />MAYHEM</b></span>
        <span className="dm-pack-choice__front">
          <small>{RARITY_LABELS[choice.rarity]}</small>
          {choice.kind === "card" ? (
            <span className="dm-pack-choice__number" data-color={choice.card.color}>
              <i />
              <b>{copy.symbol}</b>
            </span>
          ) : (
            <span className={`dm-pack-choice__icon${copy.artSrc ? " is-special-art" : ""}`}>{copy.artSrc ? <img className="special-card-art" src={copy.artSrc} alt="" /> : <b>{copy.symbol}</b>}</span>
          )}
          <strong>{copy.name}</strong>
          <span>{copy.effect}</span>
        </span>
        {selected && <em>SELECTED</em>}
      </button>
      {previewed && !selected && (
        <button type="button" className="dm-pack-choice__confirm" onClick={onConfirm}>
          SELECT
        </button>
      )}
    </div>
  );
}

function choiceTargetRules(choice?: PackChoice): { minTargets: number; maxTargets: number; needsColor: boolean } {
  if (!choice) return { minTargets: 0, maxTargets: 0, needsColor: false };
  if (choice.kind === "upgrade") return { minTargets: 1, maxTargets: 1, needsColor: false };
  if (choice.kind === "protocol") {
    switch (choice.protocolId) {
      case "emergency-credit":
        return { minTargets: 0, maxTargets: 0, needsColor: false };
      case "channel-rewire":
        return { minTargets: 1, maxTargets: 3, needsColor: true };
      default:
        return { minTargets: 1, maxTargets: 1, needsColor: false };
    }
  }
  if (choice.kind === "ghost") {
    return { minTargets: 0, maxTargets: 0, needsColor: false };
  }
  return { minTargets: 0, maxTargets: 0, needsColor: false };
}

function PackOpeningController({
  opening,
  run,
  onTake,
  onSkip,
  onPackOpen,
  onPackReveal,
}: {
  readonly opening: PackOpening;
  readonly run: RunState;
  readonly onTake: (choiceIds: readonly string[], targetCardId?: string | readonly string[], targetColor?: CardColor) => void;
  readonly onSkip: () => void;
  readonly onPackOpen: () => void;
  readonly onPackReveal: (index: number) => void;
}) {
  const [phase, setPhase] = useState<"sealed" | "opening" | "revealing" | "selecting">("sealed");
  const [revealedCount, setRevealedCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [targetCardIds, setTargetCardIds] = useState<readonly string[]>([]);
  const [targetColor, setTargetColor] = useState<CardColor | null>(null);
  const [previewChoiceId, setPreviewChoiceId] = useState<string | null>(null);
  const [packNotice, setPackNotice] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const config = CARD_PACK_CONFIG[opening.packKind];
  const choices = useMemo(() => normalizedPackChoices(opening), [opening]);
  const pickCount = opening.pickCount ?? 1;
  const selectedChoice = choices.find((choice) => selectedIds.includes(choice.id));
  const { minTargets, maxTargets, needsColor } = choiceTargetRules(selectedChoice);
  const requiresTargetCard = maxTargets > 0;
  const targetCards = useMemo(
    () => (selectedChoice?.kind === "upgrade"
      ? uniqueDeckCards(run).filter((card) => !card.enhancement)
      : uniqueDeckCards(run)),
    [run, selectedChoice],
  );

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  function openPack() {
    if (phase !== "sealed") return;
    onPackOpen();
    setPhase("opening");
    timers.current.push(window.setTimeout(() => {
      setPhase("revealing");
      choices.forEach((_, index) => {
        timers.current.push(window.setTimeout(() => {
          setRevealedCount(index + 1);
          onPackReveal(index);
          if (index === choices.length - 1) setPhase("selecting");
        }, 230 * index));
      });
    }, 520));
  }

  function previewChoice(choiceId: string) {
    if (selectedIds.includes(choiceId)) return;
    setPreviewChoiceId((current) => current === choiceId ? null : choiceId);
    setPackNotice(null);
  }

  function capacityMessage(): string | null {
    const choice = choices[0];
    if (!choice) return null;
    if (choice.kind === "modifier") {
      const available = Math.max(0, jokerSlotLimitFor(run) - run.jokers.length);
      if (available < pickCount) {
        return `MOD 슬롯이 부족합니다. 이 팩은 ${pickCount}개를 선택하지만 남은 슬롯은 ${available}개입니다. SKIP으로 보상을 포기할 수 있습니다.`;
      }
    }
    if (choice.kind === "core" || choice.kind === "ghost") {
      const available = Math.max(0, UNO_SLOT_LIMIT - run.communityUno.length);
      if (available < pickCount) {
        return `메이헴 카드 슬롯이 가득 찼습니다. 이 팩은 ${pickCount}개를 선택하지만 남은 슬롯은 ${available}개입니다. SKIP으로 보상을 포기할 수 있습니다.`;
      }
    }
    return null;
  }

  function confirmChoice(choiceId: string) {
    if (selectedIds.includes(choiceId)) return;
    if (selectedIds.length >= pickCount) {
      setPackNotice(`이 팩에서는 ${pickCount}장만 선택할 수 있습니다.`);
      return;
    }
    const capacityWarning = capacityMessage();
    if (capacityWarning) {
      setPackNotice(capacityWarning);
      return;
    }
    const nextSelectedIds = [...selectedIds, choiceId];
    setSelectedIds(nextSelectedIds);
    setPreviewChoiceId(null);
    setTargetCardIds([]);
    setPackNotice(null);

    const confirmedChoice = choices.find((choice) => choice.id === choiceId);
    const rules = choiceTargetRules(confirmedChoice);
    if (nextSelectedIds.length === pickCount && rules.maxTargets === 0) {
      onTake(nextSelectedIds);
    }
  }

  function toggleTargetCard(cardId: string) {
    setTargetCardIds((current) => {
      if (current.includes(cardId)) {
        return current.filter((id) => id !== cardId);
      }
      if (maxTargets === 1) {
        return [cardId];
      }
      if (current.length >= maxTargets) {
        return current;
      }
      return [...current, cardId];
    });
    setPackNotice(null);
  }

  const selectionFilled = selectedIds.length === pickCount;
  const targetValid = !requiresTargetCard
    || (targetCardIds.length >= minTargets && targetCardIds.length <= maxTargets);
  const colorValid = !needsColor || Boolean(targetColor);
  const takeEnabled = selectionFilled && targetValid && colorValid;
  const selectedUpgrade = choices.find(
    (choice): choice is Extract<PackChoice, { kind: "upgrade" }> =>
      selectedIds.includes(choice.id) && choice.kind === "upgrade",
  );
  const selectedTarget = targetCards.find((card) => card.id === targetCardIds[0]);

  function handleTakeClick() {
    const capacityWarning = capacityMessage();
    if (capacityWarning) {
      setPackNotice(capacityWarning);
      return;
    }
    if (!selectionFilled) {
      setPackNotice(`보스터 팩에서 카드를 ${pickCount}장 선택해 주세요.`);
      return;
    }
    if (requiresTargetCard && (targetCardIds.length < minTargets || targetCardIds.length > maxTargets)) {
      setPackNotice(
        minTargets === maxTargets
          ? `적용할 덱 카드를 ${minTargets}장 선택해야 합니다. (현재 ${targetCardIds.length}장 선택됨)`
          : `적용할 덱 카드를 ${minTargets}~${maxTargets}장 선택해야 합니다. (현재 ${targetCardIds.length}장 선택됨)`
      );
      return;
    }
    if (needsColor && !targetColor) {
      setPackNotice("변경할 색상(레드 / 옐로우 / 그린 / 블루)을 선택해야 합니다.");
      return;
    }
    setPackNotice(null);
    onTake(selectedIds, targetCardIds, targetColor ?? undefined);
  }

  return (
    <div className="dm-pack-overlay" role="dialog" aria-modal="true" aria-labelledby="dm-pack-title" data-phase={phase}>
      <section className="dm-pack-stage">
        <header>
          <span>BOOSTER OPENING</span>
          <h2 id="dm-pack-title">{config.name}</h2>
          <p>Choose {pickCount} of {choices.length} · Selected {selectedIds.length} / {pickCount}</p>
        </header>

        {packNotice && (
          <div className="dm-pack-notice">
            ⚠️ {packNotice}
          </div>
        )}

        <div className="dm-pack-content">
          {phase === "sealed" || phase === "opening" ? (
            <button type="button" className="dm-sealed-pack" data-opening={phase === "opening" || undefined} onClick={openPack}>
              <img className="dm-sealed-pack__art" src={config.artSrc} alt="" aria-hidden="true" />
              <span className="dm-sealed-pack__copy"><strong>{config.name}</strong><small>{phase === "opening" ? "OPENING…" : "CLICK TO OPEN"}</small></span>
            </button>
          ) : (
            <div className="dm-pack-choices">
              {choices.map((choice, index) => (
                <PackChoiceCard
                  choice={choice}
                  index={index}
                  revealed={index < revealedCount}
                  previewed={previewChoiceId === choice.id}
                  selected={selectedIds.includes(choice.id)}
                  disabled={phase !== "selecting"}
                  key={choice.id}
                  onPreview={() => previewChoice(choice.id)}
                  onConfirm={() => confirmChoice(choice.id)}
                />
              ))}
            </div>
          )}

          {phase === "selecting" && requiresTargetCard && selectionFilled && (
            <section className="dm-pack-targets" aria-label="적용할 덱 카드 선택">
              <header>
                <div>
                  <span>TARGET CARD</span>
                  <strong>
                    {minTargets === maxTargets
                      ? `적용할 덱 카드 ${minTargets}장을 선택하세요`
                      : `적용할 덱 카드를 ${minTargets}~${maxTargets}장 선택하세요`}
                    {` (선택됨 ${targetCardIds.length}/${maxTargets}장)`}
                  </strong>
                </div>
                {selectedUpgrade && selectedTarget && (
                  <p>
                    {COLOR_LABELS[selectedTarget.color]} {selectedTarget.rank} · 기본
                    <b> → {CARD_ENHANCEMENT_CONFIG[selectedUpgrade.enhancement].name}</b>
                  </p>
                )}
              </header>
              {needsColor && (
                <div
                  className="dm-utility-colors"
                  data-has-selection={Boolean(targetColor)}
                  role="group"
                  aria-label="변경할 채널 색"
                >
                  {(["red", "yellow", "green", "blue"] as const).map((color) => {
                    const isSelected = targetColor === color;
                    return (
                      <button
                        type="button"
                        data-color={color}
                        aria-pressed={isSelected}
                        key={color}
                        onClick={() => {
                          setTargetColor(color);
                          setPackNotice(null);
                        }}
                      >
                        {COLOR_LABELS[color]} {isSelected ? "✓" : ""}
                      </button>
                    );
                  })}
                </div>
              )}
              <DeckCardGrid
                cards={targetCards}
                ariaLabel="대상 카드"
                selectedIds={targetCardIds}
                onSelect={(card) => toggleTargetCard(card.id)}
              />
              <button
                type="button"
                className="dm-pack-target-confirm"
                disabled={!takeEnabled}
                onClick={handleTakeClick}
              >
                SELECT TARGET
              </button>
            </section>
          )}
        </div>

        {phase === "selecting" && (
          <footer className="dm-pack-footer">
            <span>선택하지 않고 나가면 이 팩의 보상은 사라지며, 구매 금액은 반환되지 않습니다.</span>
            <button type="button" className="dm-pack-skip" onClick={onSkip}>
              SKIP · 보상 포기
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

export function GarageView({
  run,
  embedded = false,
  notice = "",
  onBuy,
  onReroll,
  onNext,
  onSelectDeckTarget,
  onTakePack,
  onSkipPack,
  onPackOpen,
  onPackReveal,
  selectedDetailKey,
  onSelectedDetailChange,
}: GarageViewProps) {
  const offers = useMemo(() => run.shop?.offers ?? [], [run.shop?.offers]);
  const soldIds = useMemo(() => new Set(run.shop?.soldOfferIds ?? []), [run.shop?.soldOfferIds]);
  const [uncontrolledSelectedOfferId, setUncontrolledSelectedOfferId] = useState<string | null>(null);
  const selectedOfferId = onSelectedDetailChange
    ? selectedDetailKey?.startsWith("shop-") ? selectedDetailKey.slice("shop-".length) : null
    : uncontrolledSelectedOfferId;
  const [targetOfferId, setTargetOfferId] = useState<string | null>(null);
  const [protocolOfferId, setProtocolOfferId] = useState<string | null>(null);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [leavingGarage, setLeavingGarage] = useState(false);
  const purchaseTimer = useRef<number | null>(null);
  const nextTimer = useRef<number | null>(null);
  const targetOffer = offers.find(
    (offer): offer is DeckWorkShopOffer => offer.kind === "deck-work" && offer.id === targetOfferId,
  );
  const protocolOffer = offers.find(
    (offer): offer is Extract<ShopOffer, { kind: "protocol" }> => offer.kind === "protocol" && offer.id === protocolOfferId,
  );
  const visibleSelectedOfferId = offers.some((offer) => offer.id === selectedOfferId)
    ? selectedOfferId
    : null;
  const setSelectedOffer = (offerId: string | null) => {
    if (onSelectedDetailChange) onSelectedDetailChange(offerId ? `shop-${offerId}` : null);
    else setUncontrolledSelectedOfferId(offerId);
  };
  const offerById = new Map(offers.map((offer) => [offer.id, offer]));
  const leaveForNextRound = () => {
    if (leavingGarage || run.packOpening) return;
    setLeavingGarage(true);
    nextTimer.current = window.setTimeout(onNext, 330);
  };

  useEffect(() => () => {
    if (nextTimer.current !== null) window.clearTimeout(nextTimer.current);
  }, []);
  const signalOffers = (run.shop?.signalOfferIds
    ? run.shop.signalOfferIds.map((id) => offerById.get(id)).filter((offer): offer is ShopOffer => Boolean(offer))
    : offers.filter((offer) => !["card-pack", "deck-work", "firmware"].includes(String(offer.kind))))
    .slice(0, 2);
  const metadataLab = run.shop?.deckLabOfferId ? offerById.get(run.shop.deckLabOfferId) : undefined;
  const deckLabOffers = (metadataLab
    ? [metadataLab]
    : offers.filter((offer) => ["deck-work", "firmware"].includes(String(offer.kind))))
    .slice(0, 1);
  const packOffers = (run.shop?.packOfferIds
    ? run.shop.packOfferIds.map((id) => offerById.get(id)).filter((offer): offer is ShopOffer => Boolean(offer))
    : offers.filter((offer) => offer.kind === "card-pack"))
    .slice(0, 2);

  useEffect(() => () => {
    if (purchaseTimer.current !== null) window.clearTimeout(purchaseTimer.current);
  }, []);

  function purchase(offer: ShopOffer, options?: UseConsumableOptions) {
    if (purchasingId || soldIds.has(offer.id)) return;
    if (offer.kind === "deck-work") {
      setTargetOfferId(offer.id);
      return;
    }
    if (offer.kind === "protocol" && offer.protocolId !== "emergency-credit" && !options) {
      setProtocolOfferId(offer.id);
      return;
    }
    setPurchasingId(offer.id);
    purchaseTimer.current = window.setTimeout(() => {
      onBuy(offer, options);
      purchaseTimer.current = window.setTimeout(() => {
        setPurchasingId(null);
        setSelectedOffer(null);
        setProtocolOfferId(null);
      }, 220);
    }, 220);
  }

  function renderOffer(offer: ShopOffer) {
    return (
      <ShopSlot
        offer={offer}
        run={run}
        sold={soldIds.has(offer.id)}
        selected={visibleSelectedOfferId === offer.id}
        purchasing={purchasingId === offer.id}
        key={offer.id}
        onSelect={() => setSelectedOffer(selectedOfferId === offer.id ? null : offer.id)}
        onBuy={() => purchase(offer)}
      />
    );
  }

  return (
    <section
      className={`dm-garage${embedded ? " dm-garage--embedded" : ""}${leavingGarage ? " is-leaving" : ""}`}
      aria-label={embedded ? "DECK MAYHEM GARAGE" : undefined}
      aria-labelledby={embedded ? undefined : "dm-garage-title"}
    >
      <div className="dm-garage__backdrop" aria-hidden="true"><i /><i /><i /></div>
      {!embedded && (
        <header className="dm-garage-bar">
          <div className="dm-garage-brand">
            <span>DECK MAYHEM</span><h1 id="dm-garage-title">GARAGE</h1><small>카드를 골라 런 회로를 개조하세요.</small>
          </div>
          <dl className="dm-garage-stats">
            <div><dt>STAGE</dt><dd>{run.ante}</dd></div>
            <div><dt>LAST</dt><dd>{ROUND_LABELS[run.round]}</dd></div>
            <div className="is-wallet" key={run.coins}><dt>WALLET</dt><dd>{run.coins}¢</dd></div>
          </dl>
        </header>
      )}

      {notice && (
        <p className="dm-garage-notice dm-garage-notice--floating" role="status" aria-live="polite">
          {notice}
        </p>
      )}

      <div className="dm-garage-workspace">
        <div className="dm-shop-board" aria-label="Garage 판매 상품">
          <section className="dm-shop-zone dm-shop-controls" aria-label="상점 조작">
            <nav className="dm-garage-actions" aria-label="Garage 도구">
              <button
                type="button"
                className="is-next"
                disabled={Boolean(run.packOpening) || leavingGarage}
                onClick={leaveForNextRound}
                aria-label={`다음 라운드로 이동 · ${nextTargetLabel(run)}`}
              >
                <span>다음<br />라운드</span>
              </button>
              <button
                type="button"
                className="is-reroll"
                disabled={!run.shop || run.coins < run.shop.rerollCost || Boolean(run.packOpening)}
                onClick={() => { setSelectedOffer(null); onReroll(); }}
                aria-label={`새로고침 · 오늘의 신호만 교체, ${run.shop?.rerollCost ?? 0}코인`}
              >
                <span>새로고침</span><b>{run.shop?.rerollCost ?? 0}¢</b>
              </button>
            </nav>
          </section>

          <section className="dm-shop-zone dm-shop-signal" aria-label="오늘의 신호">
            <div className="dm-shop-grid">
              {signalOffers.map(renderOffer)}
              {Array.from({ length: Math.max(0, 2 - signalOffers.length) }, (_, index) => (
                <EmptyShopSlot eyebrow="NO SIGNAL" message="빈 신호 슬롯" key={`signal-empty-${index}`} />
              ))}
            </div>
          </section>

          <section className="dm-shop-zone dm-shop-lab" aria-label="DECK LAB">
            <div className="dm-shop-grid">
              <div className="dm-shop-lab-voucher">
                <span className="dm-shop-lab-voucher__label" aria-hidden="true">설치 제한</span>
                {deckLabOffers.map(renderOffer)}
                {deckLabOffers.length === 0 && <EmptyShopSlot eyebrow="LAB OFFLINE" message="정비 항목 없음" />}
              </div>
            </div>
          </section>

          <section className="dm-shop-zone dm-shop-packs" aria-label="PACK BAY">
            <div className="dm-shop-grid">
              {packOffers.map(renderOffer)}
              {Array.from({ length: Math.max(0, 2 - packOffers.length) }, (_, index) => (
                <EmptyShopSlot eyebrow="BAY EMPTY" message="팩 준비 중" key={`pack-empty-${index}`} />
              ))}
            </div>
          </section>
        </div>
      </div>

      {targetOffer && (
        <DeckTargetOverlay
          run={run}
          offer={targetOffer}
          onClose={() => setTargetOfferId(null)}
          onSelect={(card) => {
            onSelectDeckTarget(targetOffer, card);
            setTargetOfferId(null);
            setSelectedOffer(null);
          }}
        />
      )}
      {protocolOffer && (
        <ProtocolTargetOverlay
          run={run}
          offer={protocolOffer}
          onClose={() => setProtocolOfferId(null)}
          onSelect={(options) => {
            purchase(protocolOffer, options);
            setProtocolOfferId(null);
          }}
        />
      )}
      {run.packOpening && (
        <PackOpeningController
          key={run.packOpening.offerId}
          opening={run.packOpening}
          run={run}
          onPackOpen={onPackOpen}
          onPackReveal={onPackReveal}
          onTake={(choiceIds, targetCardId, targetColor) => onTakePack(run.packOpening!, choiceIds, targetCardId, targetColor)}
          onSkip={() => onSkipPack(run.packOpening!)}
        />
      )}
    </section>
  );
}
