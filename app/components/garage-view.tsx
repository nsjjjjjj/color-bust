"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  HAND_RULES,
  JOKER_CATALOG,
  JOKER_SLOT_LIMIT,
  UNO_MODULE_CATALOG,
  UNO_SLOT_LIMIT,
} from "../../lib/game/constants";
import {
  CARD_ENHANCEMENT_CONFIG,
  CARD_PACK_CONFIG,
  DECK_WORK_CONFIG,
  MINIMUM_RUN_DECK_SIZE,
} from "../../lib/game/garage-config";
import type {
  CardColor,
  DeckWorkShopOffer,
  GameCard,
  PackOpening,
  RunState,
  ShopOffer,
} from "../../lib/game/types";

type GarageSection = "mods" | "deck" | "packs" | "patterns" | "mayhem";

const GARAGE_SECTIONS: readonly {
  readonly id: GarageSection;
  readonly label: string;
  readonly koreanLabel: string;
  readonly description: string;
}[] = [
  {
    id: "mods",
    label: "MOD BAY",
    koreanLabel: "모드 장착",
    description: "런 동안 계속 작동하는 MOD를 장착합니다.",
  },
  {
    id: "deck",
    label: "DECK LAB",
    koreanLabel: "덱 수술",
    description: "카드를 제거·복제하거나 색과 숫자를 개조합니다.",
  },
  {
    id: "packs",
    label: "PACK RACK",
    koreanLabel: "카드 팩",
    description: "팩을 열고 공개된 카드 중 한 장을 덱에 연결합니다.",
  },
  {
    id: "patterns",
    label: "PATTERN CORE",
    koreanLabel: "패턴 강화",
    description: "선호하는 패턴의 POWER와 HYPE를 영구 강화합니다.",
  },
  {
    id: "mayhem",
    label: "MAYHEM",
    koreanLabel: "커뮤니티 규칙",
    description: "다른 플레이어가 제작한 위험한 규칙을 확인합니다.",
  },
] as const;

const SECTION_FOR_OFFER: Readonly<Record<ShopOffer["kind"], GarageSection>> = {
  joker: "mods",
  "deck-work": "deck",
  "card-pack": "packs",
  "hand-upgrade": "patterns",
  "community-uno": "mayhem",
};

const COLOR_LABELS: Readonly<Record<CardColor, string>> = {
  red: "빨강",
  blue: "파랑",
  green: "초록",
  yellow: "노랑",
};

const RARITY_LABELS = {
  common: "STANDARD",
  uncommon: "UNCOMMON",
  rare: "RARE",
} as const;

const ROUND_LABELS: Readonly<Record<RunState["round"], string>> = {
  small: "WARM-UP",
  big: "BREAKPOINT",
  boss: "MAYHEM ROUND",
};

type OfferPresentation = {
  readonly name: string;
  readonly description: string;
  readonly eyebrow: string;
  readonly symbol: string;
  readonly meta?: string;
  readonly disabledReason?: string;
};

export interface GarageViewProps {
  readonly run: RunState;
  readonly notice?: string;
  readonly onBuy: (offer: ShopOffer) => void;
  readonly onReroll: () => void;
  readonly onSell: (instanceId: string) => void;
  readonly onNext: () => void;
  /** Completes a targeted Deck Lab purchase. The parent owns validation and payment. */
  readonly onSelectDeckTarget: (
    offer: DeckWorkShopOffer,
    card: GameCard,
  ) => void;
  /** Connects one revealed pack card to the persistent run deck. */
  readonly onChoosePack: (opening: PackOpening, card: GameCard) => void;
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
  const source = run.deck ?? [
    ...run.hand,
    ...run.drawPile,
    ...run.discardPile,
  ];
  const cards = new Map<string, GameCard>();
  source.forEach((card) => cards.set(card.id, card));
  return [...cards.values()];
}

function offerPresentation(offer: ShopOffer, run: RunState): OfferPresentation {
  const shortfall = Math.max(0, offer.price - run.coins);
  let disabledReason = shortfall > 0 ? `${shortfall}¢ 부족` : undefined;

  switch (offer.kind) {
    case "joker": {
      const definition = JOKER_CATALOG[offer.jokerId];
      if (run.jokers.some((joker) => joker.jokerId === offer.jokerId)) {
        disabledReason = "이미 장착한 MOD";
      } else if (run.jokers.length >= JOKER_SLOT_LIMIT) {
        disabledReason = "MOD 슬롯 가득 참";
      }
      return {
        eyebrow: RARITY_LABELS[definition.rarity],
        name: definition.name,
        description: normalizeTerminology(definition.description),
        symbol: definition.name.slice(0, 1),
        meta: `MOD SLOT ${run.jokers.length}/${JOKER_SLOT_LIMIT}`,
        disabledReason,
      };
    }
    case "deck-work": {
      const work = DECK_WORK_CONFIG[offer.work];
      const deckSize = uniqueDeckCards(run).length;
      if (offer.work === "remove" && deckSize <= MINIMUM_RUN_DECK_SIZE) {
        disabledReason = `덱 최소 ${MINIMUM_RUN_DECK_SIZE}장`;
      }
      return {
        eyebrow: "DECK WORK",
        name: work.name,
        description: normalizeTerminology(work.description),
        symbol: work.symbol,
        meta: offer.targetColor
          ? `${COLOR_LABELS[offer.targetColor]} 채널 · 덱 ${deckSize}장`
          : `현재 덱 ${deckSize}장`,
        disabledReason,
      };
    }
    case "card-pack": {
      const pack = CARD_PACK_CONFIG[offer.packKind];
      return {
        eyebrow: offer.packKind === "glitch" ? "UNSTABLE PACK" : "CARD PACK",
        name: pack.name,
        description: normalizeTerminology(pack.description),
        symbol: pack.symbol,
        meta: "3장 공개 · 1장 연결",
        disabledReason,
      };
    }
    case "hand-upgrade": {
      const rule = HAND_RULES[offer.handType];
      const level = run.handLevels[offer.handType];
      return {
        eyebrow: "PATTERN CHIP",
        name: rule.name,
        description: `레벨 ${level} → ${level + 1} · POWER +${rule.chipsPerLevel} · HYPE +${rule.multiplierPerLevel}`,
        symbol: "▲",
        meta: `현재 PATTERN LEVEL ${level}`,
        disabledReason,
      };
    }
    case "community-uno": {
      const alreadyOwned = run.communityUno.some(
        (card) => card.id === offer.card.id,
      );
      if (alreadyOwned) disabledReason = "이미 보유한 규칙";
      else if (run.communityUno.length >= UNO_SLOT_LIMIT) {
        disabledReason = "MAYHEM 슬롯 가득 참";
      }
      return {
        eyebrow: "COMMUNITY MAYHEM",
        name: offer.card.name,
        description: `${offer.card.author} 제작 · 긍정과 결함 예산이 0으로 균형 잡힌 규칙입니다.`,
        symbol: "M",
        meta: `MAYHEM SLOT ${run.communityUno.length}/${UNO_SLOT_LIMIT}`,
        disabledReason,
      };
    }
  }
}

function nextTargetLabel(run: RunState): string {
  if (run.round === "small") return "BREAKPOINT";
  if (run.round === "big") return "MAYHEM ROUND";
  return `STAGE ${run.ante + 1}`;
}

function targetDisabledReason(
  offer: DeckWorkShopOffer,
  card: GameCard,
  deckSize: number,
): string | null {
  if (offer.work === "remove" && deckSize <= MINIMUM_RUN_DECK_SIZE) {
    return `덱은 최소 ${MINIMUM_RUN_DECK_SIZE}장을 유지해야 합니다.`;
  }
  if (offer.work === "shift-up" && card.rank === 9) {
    return "9는 더 높일 수 없습니다.";
  }
  if (offer.work === "shift-down" && card.rank === 0) {
    return "0은 더 낮출 수 없습니다.";
  }
  if (
    offer.work === "recolor" &&
    offer.targetColor !== undefined &&
    offer.targetColor === card.color
  ) {
    return `이미 ${COLOR_LABELS[card.color]} 카드입니다.`;
  }
  if ((offer.work === "charge" || offer.work === "amplify") && card.enhancement) {
    return "이미 특수효과가 있는 카드입니다.";
  }
  return null;
}

function enhancementLabel(card: GameCard): string | null {
  if (!card.enhancement) return null;
  return CARD_ENHANCEMENT_CONFIG[card.enhancement].name;
}

function DeckCardButton({
  card,
  disabledReason,
  onSelect,
}: {
  readonly card: GameCard;
  readonly disabledReason?: string | null;
  readonly onSelect: () => void;
}) {
  const enhancement = enhancementLabel(card);
  const label = `${COLOR_LABELS[card.color]} ${card.rank} 카드${enhancement ? `, ${enhancement} 효과` : ""}${disabledReason ? `, 선택 불가: ${disabledReason}` : ""}`;

  return (
    <button
      type="button"
      className="dm-garage-deck-card"
      data-color={card.color}
      data-enhancement={card.enhancement}
      disabled={Boolean(disabledReason)}
      aria-label={label}
      title={disabledReason ?? label}
      onClick={onSelect}
    >
      <span className="dm-garage-deck-card__corner">{card.rank}</span>
      <strong>{card.rank}</strong>
      <span className="dm-garage-deck-card__color">{COLOR_LABELS[card.color]}</span>
      {enhancement && (
        <small className="dm-garage-deck-card__enhancement">{enhancement}</small>
      )}
    </button>
  );
}

function OwnedMods({
  run,
  onSell,
}: {
  readonly run: RunState;
  readonly onSell: (instanceId: string) => void;
}) {
  return (
    <section className="dm-garage-owned" aria-labelledby="dm-garage-owned-title">
      <header className="dm-garage-subhead">
        <div>
          <span>INSTALLED</span>
          <h3 id="dm-garage-owned-title">장착한 MOD</h3>
        </div>
        <strong>{run.jokers.length}/{JOKER_SLOT_LIMIT}</strong>
      </header>
      <div className="dm-garage-owned__rack">
        {run.jokers.map((joker) => {
          const definition = JOKER_CATALOG[joker.jokerId];
          const refund = Math.max(1, Math.floor(definition.price / 2));
          return (
            <article
              className="dm-garage-owned-mod"
              data-rarity={definition.rarity}
              key={joker.instanceId}
            >
              <span className="dm-garage-owned-mod__icon" aria-hidden="true">
                {definition.name.slice(0, 1)}
              </span>
              <div>
                <strong>{definition.name}</strong>
                <small>{normalizeTerminology(definition.description)}</small>
              </div>
              <button
                type="button"
                aria-label={`${definition.name} MOD를 ${refund}코인에 판매`}
                onClick={() => onSell(joker.instanceId)}
              >
                판매 {refund}¢
              </button>
            </article>
          );
        })}
        {Array.from(
          { length: Math.max(0, JOKER_SLOT_LIMIT - run.jokers.length) },
          (_, index) => (
            <div
              className="dm-garage-owned-mod is-empty"
              aria-label={`빈 MOD 슬롯 ${index + 1}`}
              key={`empty-mod-${index}`}
            >
              <span aria-hidden="true">+</span>
              <small>EMPTY SLOT</small>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function MayhemModuleList({ offer }: { readonly offer: Extract<ShopOffer, { kind: "community-uno" }> }) {
  const moduleIds = [...offer.card.positiveModules, ...offer.card.negativeModules];
  return (
    <ul className="dm-garage-mayhem-modules" aria-label="메이헴 규칙 구성">
      {moduleIds.map((moduleId) => {
        const moduleDefinition = UNO_MODULE_CATALOG[moduleId];
        return (
          <li data-kind={moduleDefinition.kind} key={moduleId}>
            <b>{moduleDefinition.points > 0 ? "+" : ""}{moduleDefinition.points}</b>
            <span>
              <strong>{moduleDefinition.name}</strong>
              <small>{normalizeTerminology(moduleDefinition.description)}</small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function OfferCard({
  offer,
  run,
  selectedForTarget,
  onBuy,
  onBeginTargeting,
}: {
  readonly offer: ShopOffer;
  readonly run: RunState;
  readonly selectedForTarget: boolean;
  readonly onBuy: (offer: ShopOffer) => void;
  readonly onBeginTargeting: (offer: DeckWorkShopOffer) => void;
}) {
  const presentation = offerPresentation(offer, run);
  const needsTarget = offer.kind === "deck-work";
  const actionLabel = presentation.disabledReason
    ?? (needsTarget
      ? selectedForTarget ? "대상 선택 중" : "카드 선택"
      : offer.kind === "card-pack" ? "팩 열기" : "구매");

  return (
    <article
      className={`dm-garage-offer${selectedForTarget ? " is-targeting" : ""}`}
      data-offer-kind={offer.kind}
      data-disabled={Boolean(presentation.disabledReason) || undefined}
    >
      <header>
        <span>{presentation.eyebrow}</span>
        <strong>{offer.price}¢</strong>
      </header>
      <div className="dm-garage-offer__art" aria-hidden="true">
        <i />
        <b>{presentation.symbol}</b>
      </div>
      <div className="dm-garage-offer__copy">
        <h3>{presentation.name}</h3>
        <p>{presentation.description}</p>
        {presentation.meta && <small>{presentation.meta}</small>}
      </div>
      {offer.kind === "community-uno" && <MayhemModuleList offer={offer} />}
      <footer>
        {presentation.disabledReason && (
          <small role="note">{presentation.disabledReason}</small>
        )}
        <button
          type="button"
          className="dm-garage-action"
          disabled={Boolean(presentation.disabledReason)}
          aria-pressed={needsTarget ? selectedForTarget : undefined}
          onClick={() => {
            if (offer.kind === "deck-work") onBeginTargeting(offer);
            else onBuy(offer);
          }}
        >
          {actionLabel}
        </button>
      </footer>
    </article>
  );
}

function PackOpeningView({
  opening,
  onChoose,
}: {
  readonly opening: PackOpening;
  readonly onChoose: (opening: PackOpening, card: GameCard) => void;
}) {
  const config = CARD_PACK_CONFIG[opening.packKind];
  return (
    <section className="dm-garage-pack-opening" aria-labelledby="dm-pack-opening-title">
      <header>
        <span>PACK OPEN</span>
        <h3 id="dm-pack-opening-title">{config.name}</h3>
        <p>공개된 카드 중 한 장을 선택해 런 덱에 연결하세요.</p>
      </header>
      <div className="dm-garage-pack-opening__choices">
        {opening.choices.map((card) => {
          const enhancement = card.enhancement
            ? CARD_ENHANCEMENT_CONFIG[card.enhancement]
            : null;
          return (
            <article
              className="dm-garage-pack-choice"
              data-color={card.color}
              data-enhancement={card.enhancement}
              key={card.id}
            >
              <span className="dm-garage-pack-choice__badge">
                {enhancement?.name ?? "NUMBER CARD"}
              </span>
              <div className="dm-garage-pack-choice__card" aria-hidden="true">
                <small>{card.rank}</small>
                <strong>{card.rank}</strong>
                <i>{COLOR_LABELS[card.color]}</i>
              </div>
              <h4>{COLOR_LABELS[card.color]} {card.rank}</h4>
              <p>{enhancement?.description ?? "기본 숫자 카드"}</p>
              <button
                type="button"
                className="dm-garage-action"
                onClick={() => onChoose(opening, card)}
              >
                덱에 연결
              </button>
            </article>
          );
        })}
      </div>
    </section>
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
  onChoosePack,
}: GarageViewProps) {
  const [activeSection, setActiveSection] = useState<GarageSection>("mods");
  const [targetOfferId, setTargetOfferId] = useState<string | null>(null);
  const tabPrefix = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const offers = useMemo(() => run.shop?.offers ?? [], [run.shop?.offers]);
  const deckCards = useMemo(() => uniqueDeckCards(run), [run]);
  const targetOffer = offers.find(
    (offer): offer is DeckWorkShopOffer =>
      offer.kind === "deck-work" && offer.id === targetOfferId,
  );

  const groupedOffers = useMemo(() => {
    const groups: Record<GarageSection, ShopOffer[]> = {
      mods: [],
      deck: [],
      packs: [],
      patterns: [],
      mayhem: [],
    };
    offers.forEach((offer) => groups[SECTION_FOR_OFFER[offer.kind]].push(offer));
    return groups;
  }, [offers]);

  function selectTab(index: number) {
    const next = GARAGE_SECTIONS[index];
    if (!next) return;
    setActiveSection(next.id);
    window.requestAnimationFrame(() => tabRefs.current[index]?.focus());
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % GARAGE_SECTIONS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + GARAGE_SECTIONS.length) % GARAGE_SECTIONS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = GARAGE_SECTIONS.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    selectTab(nextIndex);
  }

  return (
    <main className="dm-garage" aria-labelledby="dm-garage-title">
      <div className="dm-garage__backdrop" aria-hidden="true"><i /><i /><i /></div>
      <header className="dm-garage__header">
        <div className="dm-garage__title">
          <span>DECK MAYHEM SERVICE NODE</span>
          <h1 id="dm-garage-title">GARAGE</h1>
          <p>덱을 고치고, 연결하고, 망가뜨리세요.</p>
        </div>
        <dl className="dm-garage__run-state" aria-label="현재 런 정보">
          <div><dt>STAGE</dt><dd>{run.ante}</dd></div>
          <div><dt>LAST TARGET</dt><dd>{ROUND_LABELS[run.round]}</dd></div>
          <div className="is-wallet"><dt>WALLET</dt><dd>{run.coins}¢</dd></div>
        </dl>
        <div className="dm-garage__header-actions">
          <button
            type="button"
            className="dm-garage__reroll"
            disabled={!run.shop || run.coins < run.shop.rerollCost}
            onClick={onReroll}
          >
            <span>진열 갱신</span>
            <strong>{run.shop?.rerollCost ?? 0}¢</strong>
          </button>
          <button type="button" className="dm-garage__next" onClick={onNext}>
            <span>정비 완료</span>
            <strong>{nextTargetLabel(run)} →</strong>
          </button>
        </div>
      </header>

      <p className="dm-garage__notice" role="status" aria-live="polite">
        {notice || "구역을 골라 다음 TARGET을 위한 빌드를 조정하세요."}
      </p>

      <div className="dm-garage__tabs" role="tablist" aria-label="Garage 구역">
        {GARAGE_SECTIONS.map((section, index) => {
          const selected = activeSection === section.id;
          const tabId = `${tabPrefix}-${section.id}-tab`;
          const panelId = `${tabPrefix}-${section.id}-panel`;
          return (
            <button
              type="button"
              role="tab"
              id={tabId}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              className="dm-garage__tab"
              data-section={section.id}
              ref={(element) => { tabRefs.current[index] = element; }}
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <span>{section.label}</span>
              <small>{section.koreanLabel}</small>
              <b>{groupedOffers[section.id].length}</b>
            </button>
          );
        })}
      </div>

      {GARAGE_SECTIONS.map((section) => {
        const selected = activeSection === section.id;
        const tabId = `${tabPrefix}-${section.id}-tab`;
        const panelId = `${tabPrefix}-${section.id}-panel`;
        const sectionOffers = groupedOffers[section.id];
        return (
          <section
            role="tabpanel"
            id={panelId}
            aria-labelledby={tabId}
            className="dm-garage__panel"
            data-section={section.id}
            hidden={!selected}
            key={section.id}
          >
            <header className="dm-garage__panel-header">
              <div>
                <span>{section.label}</span>
                <h2>{section.koreanLabel}</h2>
              </div>
              <p>{section.description}</p>
            </header>

            {section.id === "mods" && <OwnedMods run={run} onSell={onSell} />}
            {section.id === "packs" && run.packOpening && (
              <PackOpeningView opening={run.packOpening} onChoose={onChoosePack} />
            )}

            <div className="dm-garage__offers">
              {sectionOffers.map((offer) => (
                <OfferCard
                  offer={offer}
                  run={run}
                  selectedForTarget={offer.id === targetOfferId}
                  key={offer.id}
                  onBuy={onBuy}
                  onBeginTargeting={(deckOffer) => {
                    setTargetOfferId(
                      targetOfferId === deckOffer.id ? null : deckOffer.id,
                    );
                  }}
                />
              ))}
            </div>

            {sectionOffers.length === 0 && !(section.id === "packs" && run.packOpening) && (
              <div className="dm-garage__empty" role="note">
                <strong>EMPTY BAY</strong>
                <span>이 구역은 품절입니다. 진열을 갱신하거나 다음 TARGET으로 이동하세요.</span>
              </div>
            )}

            {section.id === "deck" && targetOffer && (
              <section
                className="dm-garage-target-picker"
                aria-labelledby="dm-garage-target-picker-title"
              >
                <header>
                  <div>
                    <span>SELECT TARGET</span>
                    <h3 id="dm-garage-target-picker-title">
                      {DECK_WORK_CONFIG[targetOffer.work].name} 대상 카드
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTargetOfferId(null)}
                    aria-label="덱 작업 대상 선택 취소"
                  >
                    취소
                  </button>
                </header>
                <p>{normalizeTerminology(DECK_WORK_CONFIG[targetOffer.work].description)}</p>
                <div className="dm-garage-target-picker__cards">
                  {deckCards.map((card) => {
                    const reason = targetDisabledReason(
                      targetOffer,
                      card,
                      deckCards.length,
                    );
                    return (
                      <DeckCardButton
                        card={card}
                        disabledReason={reason}
                        key={card.id}
                        onSelect={() => onSelectDeckTarget(targetOffer, card)}
                      />
                    );
                  })}
                </div>
              </section>
            )}
          </section>
        );
      })}
    </main>
  );
}
