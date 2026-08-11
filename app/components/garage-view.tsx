"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import {
  HAND_RULES,
  JOKER_CATALOG,
  JOKER_SLOT_LIMIT,
  UNO_SLOT_LIMIT,
} from "../../lib/game/constants";
import {
  CARD_ENHANCEMENT_CONFIG,
  CARD_PACK_CONFIG,
  DECK_WORK_CONFIG,
  MINIMUM_RUN_DECK_SIZE,
} from "../../lib/game/garage-config";
import { PACK_DEFINITIONS } from "../../lib/game/packs";
import type {
  CardColor,
  CardRarity,
  DeckWorkShopOffer,
  GameCard,
  PackChoice,
  PackOpening,
  RunState,
  ShopOffer,
} from "../../lib/game/types";

const COLOR_LABELS: Readonly<Record<CardColor, string>> = {
  red: "빨강",
  blue: "파랑",
  green: "초록",
  yellow: "노랑",
};

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
  readonly meta: string;
  readonly disabledReason?: string;
};

export interface GarageViewProps {
  readonly run: RunState;
  readonly notice?: string;
  readonly onBuy: (offer: ShopOffer) => void;
  readonly onReroll: () => void;
  readonly onSell: (instanceId: string) => void;
  readonly onNext: () => void;
  readonly onSelectDeckTarget: (offer: DeckWorkShopOffer, card: GameCard) => void;
  readonly onTakePack: (
    opening: PackOpening,
    choiceIds: readonly string[],
    targetCardId?: string,
  ) => void;
  readonly onPackOpen: () => void;
  readonly onPackReveal: (index: number) => void;
}

function normalizeTerminology(value: string): string {
  return value
    .replaceAll("조커", "MOD")
    .replaceAll("족보", "패턴")
    .replaceAll("칩", "POWER")
    .replaceAll("배수", "HYPE")
    .replaceAll("앤티", "STAGE");
}

function uniqueDeckCards(run: RunState): readonly GameCard[] {
  const source = run.deck ?? [...run.hand, ...run.drawPile, ...run.discardPile];
  const cards = new Map<string, GameCard>();
  source.forEach((card) => cards.set(card.id, card));
  return [...cards.values()];
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

  if (offer.kind === "joker") {
    const definition = JOKER_CATALOG[offer.jokerId];
    if (run.jokers.some((joker) => joker.jokerId === offer.jokerId)) {
      disabledReason = "이미 장착한 MOD";
    } else if (run.jokers.length >= JOKER_SLOT_LIMIT) {
      disabledReason = "MOD 슬롯 가득 참";
    }
    return {
      category: "MODIFIER",
      rarity: modifierRarity(offer.jokerId),
      name: definition.name,
      effect: normalizeTerminology(definition.description),
      detail: `런 동안 모든 핸드에 적용 · ${run.jokers.length}/${JOKER_SLOT_LIMIT} 슬롯 사용 중`,
      symbol: definition.name.slice(0, 1),
      meta: `PASSIVE MOD · ${definition.price}¢ VALUE`,
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
      run.jokers.length + definition.pickCount > JOKER_SLOT_LIMIT
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
      meta: `${definition.contents.toUpperCase()} POOL`,
      disabledReason,
    };
  }

  if (offer.kind === "hand-upgrade") {
    const rule = HAND_RULES[offer.handType];
    const level = run.handLevels[offer.handType];
    return {
      category: "PATTERN CORE",
      rarity: level >= 4 ? "rare" : "uncommon",
      name: rule.name,
      effect: `Lv.${level} → Lv.${level + 1} · POWER +${rule.chipsPerLevel} · HYPE +${rule.multiplierPerLevel}`,
      detail: "이 런 동안 같은 패턴을 낼 때마다 영구 적용됩니다.",
      symbol: "▲",
      meta: `CURRENT LEVEL ${level}`,
      disabledReason,
    };
  }

  const alreadyOwned = run.communityUno.some((card) => card.id === offer.card.id);
  if (alreadyOwned) disabledReason = "이미 보유한 규칙";
  else if (run.communityUno.length >= UNO_SLOT_LIMIT) disabledReason = "MAYHEM 슬롯 가득 참";
  return {
    category: "COMMUNITY MAYHEM",
    rarity: "rare",
    name: offer.card.name,
    effect: `${offer.card.author} 제작 · 긍정/결함 예산 0의 한 턴 규칙`,
    detail: `긍정 ${offer.card.positiveModules.length} · 결함 ${offer.card.negativeModules.length} · 버전 ${offer.card.version}`,
    symbol: "M",
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

function DeckCard({
  card,
  selected = false,
  disabledReason,
  onClick,
}: {
  readonly card: GameCard;
  readonly selected?: boolean;
  readonly disabledReason?: string | null;
  readonly onClick?: () => void;
}) {
  const enhancement = card.enhancement
    ? CARD_ENHANCEMENT_CONFIG[card.enhancement]
    : null;
  return (
    <button
      type="button"
      className="dm-deck-card"
      data-color={card.color}
      data-rarity={card.rarity ?? "common"}
      data-selected={selected || undefined}
      disabled={Boolean(disabledReason)}
      title={disabledReason ?? enhancement?.description ?? `${COLOR_LABELS[card.color]} ${card.rank}`}
      aria-label={`${COLOR_LABELS[card.color]} ${card.rank}${enhancement ? `, ${enhancement.name}` : ""}${selected ? ", 선택됨" : ""}`}
      onClick={onClick}
    >
      <span className="dm-deck-card__frame" aria-hidden="true" />
      <span className="dm-deck-card__corner">{card.rank}</span>
      <strong>{card.rank}</strong>
      <small>{enhancement?.name ?? COLOR_LABELS[card.color]}</small>
    </button>
  );
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
  const disabled = Boolean(item.disabledReason) || sold;
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
        onClick={onSelect}
      >
        <span className="dm-shop-slot__rarity">{RARITY_LABELS[item.rarity]}</span>
        <span className="dm-shop-slot__art" aria-hidden="true">
          <i />
          <b>{item.symbol}</b>
        </span>
        <span className="dm-shop-slot__copy">
          <small>{item.category}</small>
          <strong>{item.name}</strong>
          <span>{item.effect}</span>
        </span>
        <span className="dm-shop-slot__detail">
          <b>{item.meta}</b>
          <span>{item.detail}</span>
        </span>
      </button>
      <footer>
        <span className={item.disabledReason ? "is-disabled" : ""}>
          {item.disabledReason ?? `${offer.price}¢`}
        </span>
        <button
          type="button"
          className="dm-shop-slot__buy"
          disabled={disabled || !selected || purchasing}
          onClick={onBuy}
        >
          {sold ? "SOLD" : purchasing ? "CONNECTING…" : offer.kind === "card-pack" ? "OPEN" : offer.kind === "deck-work" ? "SELECT CARD" : "BUY"}
        </button>
      </footer>
      {sold && <div className="dm-shop-slot__sold" aria-label="판매 완료">SOLD</div>}
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
        <div className="dm-deck-grid">
          {cards.map((card) => (
            <DeckCard
              card={card}
              disabledReason={targetDisabledReason(offer, card, cards.length)}
              key={card.id}
              onClick={() => onSelect(card)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function DeckViewer({
  run,
  onSell,
  onClose,
}: {
  readonly run: RunState;
  readonly onSell: (instanceId: string) => void;
  readonly onClose: () => void;
}) {
  const cards = uniqueDeckCards(run);
  return (
    <div className="dm-garage-overlay" role="dialog" aria-modal="true" aria-labelledby="dm-deck-view-title">
      <section className="dm-garage-dialog dm-deck-viewer">
        <header>
          <div><span>RUN INVENTORY</span><h2 id="dm-deck-view-title">VIEW DECK</h2></div>
          <button type="button" onClick={onClose}>GARAGE로</button>
        </header>
        <div className="dm-deck-viewer__summary">
          <b>숫자 카드 {cards.length}</b><b>MOD {run.jokers.length}/{JOKER_SLOT_LIMIT}</b><b>MAYHEM {run.communityUno.length}/{UNO_SLOT_LIMIT}</b>
        </div>
        <div className="dm-deck-grid">
          {cards.map((card) => <DeckCard card={card} key={card.id} />)}
        </div>
        <div className="dm-owned-mods">
          {run.jokers.map((joker) => {
            const definition = JOKER_CATALOG[joker.jokerId];
            const refund = Math.max(1, Math.floor(definition.price / 2));
            return (
              <article key={joker.instanceId} data-rarity={modifierRarity(joker.jokerId)}>
                <i aria-hidden="true">{definition.name.slice(0, 1)}</i>
                <div><strong>{definition.name}</strong><small>{normalizeTerminology(definition.description)}</small></div>
                <button type="button" onClick={() => onSell(joker.instanceId)}>판매 +{refund}¢</button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function choiceCopy(choice: PackChoice): {
  readonly name: string;
  readonly effect: string;
  readonly symbol: string;
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
    };
  }
  const enhancement = CARD_ENHANCEMENT_CONFIG[choice.enhancement];
  return { name: enhancement.name, effect: enhancement.description, symbol: choice.enhancement === "overclocked" ? "OC" : "UP" };
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
  selected,
  disabled,
  onToggle,
}: {
  readonly choice: PackChoice;
  readonly index: number;
  readonly revealed: boolean;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onToggle: () => void;
}) {
  const copy = choiceCopy(choice);
  return (
    <button
      type="button"
      className="dm-pack-choice"
      data-kind={choice.kind}
      data-rarity={choice.rarity}
      data-revealed={revealed || undefined}
      data-selected={selected || undefined}
      disabled={!revealed || disabled}
      style={{ "--reveal-index": index } as CSSProperties}
      aria-label={revealed ? `${copy.name}, ${copy.effect}${selected ? ", 선택됨" : ""}` : `숨겨진 카드 ${index + 1}`}
      aria-pressed={revealed ? selected : undefined}
      onClick={onToggle}
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
          <span className="dm-pack-choice__icon"><b>{copy.symbol}</b></span>
        )}
        <strong>{copy.name}</strong>
        <span>{copy.effect}</span>
      </span>
      {selected && <em>SELECTED</em>}
    </button>
  );
}

function PackOpeningController({
  opening,
  run,
  onTake,
  onPackOpen,
  onPackReveal,
}: {
  readonly opening: PackOpening;
  readonly run: RunState;
  readonly onTake: (choiceIds: readonly string[], targetCardId?: string) => void;
  readonly onPackOpen: () => void;
  readonly onPackReveal: (index: number) => void;
}) {
  const [phase, setPhase] = useState<"sealed" | "opening" | "revealing" | "selecting">("sealed");
  const [revealedCount, setRevealedCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [targetCardId, setTargetCardId] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const config = CARD_PACK_CONFIG[opening.packKind];
  const definition = PACK_DEFINITIONS[opening.packKind];
  const choices = useMemo(() => normalizedPackChoices(opening), [opening]);
  const pickCount = opening.pickCount ?? 1;
  const upgradePack = definition.contents === "upgrade";
  const targetCards = useMemo(
    () => uniqueDeckCards(run).filter((card) => !card.enhancement),
    [run],
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

  function toggleChoice(choiceId: string) {
    setSelectedIds((current) => {
      if (current.includes(choiceId)) return current.filter((id) => id !== choiceId);
      if (current.length >= pickCount) return current;
      return [...current, choiceId];
    });
  }

  const selectionFilled = selectedIds.length === pickCount;
  const takeEnabled = selectionFilled && (!upgradePack || Boolean(targetCardId));

  return (
    <div className="dm-pack-overlay" role="dialog" aria-modal="true" aria-labelledby="dm-pack-title" data-phase={phase}>
      <section className="dm-pack-stage">
        <header>
          <span>BOOSTER OPENING</span>
          <h2 id="dm-pack-title">{config.name}</h2>
          <p>Choose {pickCount} of {choices.length} · Selected {selectedIds.length} / {pickCount}</p>
        </header>

        {phase === "sealed" || phase === "opening" ? (
          <button type="button" className="dm-sealed-pack" data-opening={phase === "opening" || undefined} onClick={openPack}>
            <span>{config.symbol}</span><strong>{config.name}</strong><small>{phase === "opening" ? "OPENING…" : "CLICK TO OPEN"}</small>
          </button>
        ) : (
          <div className="dm-pack-choices">
            {choices.map((choice, index) => (
              <PackChoiceCard
                choice={choice}
                index={index}
                revealed={index < revealedCount}
                selected={selectedIds.includes(choice.id)}
                disabled={phase !== "selecting"}
                key={choice.id}
                onToggle={() => toggleChoice(choice.id)}
              />
            ))}
          </div>
        )}

        {phase === "selecting" && upgradePack && selectionFilled && (
          <section className="dm-pack-targets" aria-label="강화를 적용할 카드 선택">
            <strong>강화를 적용할 덱 카드</strong>
            <div className="dm-deck-grid">
              {targetCards.map((card) => (
                <DeckCard card={card} selected={targetCardId === card.id} key={card.id} onClick={() => setTargetCardId(card.id)} />
              ))}
            </div>
          </section>
        )}

        <footer>
          <span>RARITY WEIGHT · {Object.entries(definition.weights).filter(([, weight]) => weight > 0).map(([rarity, weight]) => `${rarity.toUpperCase()} ${weight}`).join(" / ")}</span>
          <button type="button" disabled={!takeEnabled} onClick={() => onTake(selectedIds, targetCardId ?? undefined)}>
            TAKE {pickCount}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function GarageView({
  run,
  notice = "",
  onBuy,
  onReroll,
  onSell,
  onNext,
  onSelectDeckTarget,
  onTakePack,
  onPackOpen,
  onPackReveal,
}: GarageViewProps) {
  const offers = useMemo(() => run.shop?.offers ?? [], [run.shop?.offers]);
  const soldIds = useMemo(() => new Set(run.shop?.soldOfferIds ?? []), [run.shop?.soldOfferIds]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [targetOfferId, setTargetOfferId] = useState<string | null>(null);
  const [deckOpen, setDeckOpen] = useState(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const purchaseTimer = useRef<number | null>(null);
  const targetOffer = offers.find(
    (offer): offer is DeckWorkShopOffer => offer.kind === "deck-work" && offer.id === targetOfferId,
  );
  const visibleSelectedOfferId = offers.some((offer) => offer.id === selectedOfferId)
    ? selectedOfferId
    : null;

  useEffect(() => () => {
    if (purchaseTimer.current !== null) window.clearTimeout(purchaseTimer.current);
  }, []);

  function purchase(offer: ShopOffer) {
    if (purchasingId || soldIds.has(offer.id)) return;
    if (offer.kind === "deck-work") {
      setTargetOfferId(offer.id);
      return;
    }
    setPurchasingId(offer.id);
    purchaseTimer.current = window.setTimeout(() => {
      onBuy(offer);
      purchaseTimer.current = window.setTimeout(() => {
        setPurchasingId(null);
        setSelectedOfferId(null);
      }, 220);
    }, 220);
  }

  return (
    <main className="dm-garage" aria-labelledby="dm-garage-title">
      <div className="dm-garage__backdrop" aria-hidden="true"><i /><i /><i /></div>
      <header className="dm-garage-bar">
        <div className="dm-garage-brand">
          <span>DECK MAYHEM</span><h1 id="dm-garage-title">GARAGE</h1><small>카드를 골라 런 회로를 개조하세요.</small>
        </div>
        <dl className="dm-garage-stats">
          <div><dt>STAGE</dt><dd>{run.ante}</dd></div>
          <div><dt>LAST</dt><dd>{ROUND_LABELS[run.round]}</dd></div>
          <div className="is-wallet" key={run.coins}><dt>WALLET</dt><dd>{run.coins}¢</dd></div>
        </dl>
        <nav className="dm-garage-actions" aria-label="Garage 도구">
          <button type="button" onClick={() => setDeckOpen(true)}>VIEW DECK <b>{uniqueDeckCards(run).length}</b></button>
          <button type="button" disabled={!run.shop || run.coins < run.shop.rerollCost || Boolean(run.packOpening)} onClick={() => { setSelectedOfferId(null); onReroll(); }}>
            REROLL <b>{run.shop?.rerollCost ?? 0}¢</b>
          </button>
          <button type="button" className="is-next" disabled={Boolean(run.packOpening)} onClick={onNext}>NEXT <b>{nextTargetLabel(run)} →</b></button>
        </nav>
      </header>

      <p className="dm-garage-notice" role="status" aria-live="polite">
        {notice || "상품을 선택하면 상세 효과와 BUY 버튼이 열립니다. 구매한 슬롯은 Reroll 전까지 SOLD로 유지됩니다."}
      </p>

      <section className="dm-shop-floor" aria-label="Garage 판매 상품">
        <header><div><span>AVAILABLE HARDWARE</span><h2>오늘의 진열</h2></div><p>{offers.length - soldIds.size} AVAILABLE · {soldIds.size} SOLD</p></header>
        <div className="dm-shop-grid">
          {offers.map((offer) => (
            <ShopSlot
              offer={offer}
              run={run}
              sold={soldIds.has(offer.id)}
              selected={visibleSelectedOfferId === offer.id}
              purchasing={purchasingId === offer.id}
              key={offer.id}
              onSelect={() => setSelectedOfferId((current) => current === offer.id ? null : offer.id)}
              onBuy={() => purchase(offer)}
            />
          ))}
        </div>
      </section>

      {targetOffer && (
        <DeckTargetOverlay
          run={run}
          offer={targetOffer}
          onClose={() => setTargetOfferId(null)}
          onSelect={(card) => {
            onSelectDeckTarget(targetOffer, card);
            setTargetOfferId(null);
            setSelectedOfferId(null);
          }}
        />
      )}
      {deckOpen && (
        <DeckViewer
          run={run}
          onSell={(instanceId) => {
            setDeckOpen(false);
            onSell(instanceId);
          }}
          onClose={() => setDeckOpen(false)}
        />
      )}
      {run.packOpening && (
        <PackOpeningController
          key={run.packOpening.offerId}
          opening={run.packOpening}
          run={run}
          onPackOpen={onPackOpen}
          onPackReveal={onPackReveal}
          onTake={(choiceIds, targetCardId) => onTakePack(run.packOpening!, choiceIds, targetCardId)}
        />
      )}
    </main>
  );
}
