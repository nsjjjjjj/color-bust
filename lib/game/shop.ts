import {
  HAND_TYPES,
  type CardPackKind,
  type FirmwareId,
  type HandType,
  type JokerId,
  type JokerRarity,
  type ProtocolId,
  type RunState,
  type ShopOffer,
  type ShopState,
} from "./types";
import {
  JOKER_CATALOG,
  JOKER_IDS,
  UNO_SLOT_LIMIT,
} from "./constants";
import {
  CARD_PACK_CONFIG,
  FIRMWARE_CONFIG,
  GARAGE_OFFER_COUNTS,
  PROTOCOL_CONFIG,
  TODAY_SIGNAL_WEIGHTS,
} from "./garage-config";
import { nextRandom, randomInt } from "./rng";
import {
  canInstallFirmware,
  consumableSlotsFree,
  jokerSlotLimitFor,
  packPriceFor,
  rerollBaseCostFor,
  runConsumables,
} from "./run-upgrades";

const RARITY_WEIGHT: Readonly<Record<JokerRarity, number>> = {
  common: 65,
  uncommon: 28,
  rare: 7,
};

const PACK_KIND_WEIGHTS: readonly {
  readonly kind: Exclude<CardPackKind, "supply" | "glitch">;
  readonly weight: number;
}[] = [
  { kind: "standard", weight: 25 },
  { kind: "large", weight: 15 },
  { kind: "premium", weight: 10 },
  { kind: "modifier", weight: 12 },
  { kind: "upgrade", weight: 10 },
  { kind: "core", weight: 10 },
  { kind: "protocol", weight: 12 },
  { kind: "ghost", weight: 6 },
];

type PackCandidate = (typeof PACK_KIND_WEIGHTS)[number];
type SignalKind = keyof typeof TODAY_SIGNAL_WEIGHTS;

interface SignalPools {
  readonly jokers: JokerId[];
  readonly hands: HandType[];
  readonly protocols: ProtocolId[];
  readonly mayhem: RunState["communityUnoPool"][number][];
}

function choosePackKind(
  candidates: readonly PackCandidate[],
  rngState: number,
): { readonly kind: PackCandidate["kind"]; readonly rngState: number } {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  const roll = nextRandom(rngState);
  let cursor = roll.value * total;
  for (const candidate of candidates) {
    cursor -= candidate.weight;
    if (cursor <= 0) return { kind: candidate.kind, rngState: roll.nextState };
  }
  return { kind: candidates[candidates.length - 1].kind, rngState: roll.nextState };
}

function chooseWeightedJoker(
  candidates: readonly JokerId[],
  rngState: number,
): { readonly jokerId: JokerId; readonly rngState: number } {
  const totalWeight = candidates.reduce(
    (total, jokerId) => total + RARITY_WEIGHT[JOKER_CATALOG[jokerId].rarity],
    0,
  );
  const random = nextRandom(rngState);
  let cursor = random.value * totalWeight;

  for (const jokerId of candidates) {
    cursor -= RARITY_WEIGHT[JOKER_CATALOG[jokerId].rarity];
    if (cursor <= 0) return { jokerId, rngState: random.nextState };
  }

  return {
    jokerId: candidates[candidates.length - 1],
    rngState: random.nextState,
  };
}

function createSignalPools(state: RunState): SignalPools {
  const ownedJokers = new Set(state.jokers.map((joker) => joker.jokerId));
  const ownedProtocols = new Set(
    runConsumables(state)
      .filter((item) => item.kind === "protocol")
      .map((item) => item.protocolId),
  );
  const ownedMayhem = new Set(state.communityUno.map((card) => card.id));
  return {
    jokers:
      state.jokers.length < jokerSlotLimitFor(state)
        ? JOKER_IDS.filter((jokerId) => !ownedJokers.has(jokerId))
        : [],
    hands: [...HAND_TYPES],
    protocols:
      consumableSlotsFree(state) > 0
        ? (Object.keys(PROTOCOL_CONFIG) as ProtocolId[]).filter(
            (protocolId) => !ownedProtocols.has(protocolId),
          )
        : [],
    mayhem:
      state.communityUno.length < UNO_SLOT_LIMIT
        ? state.communityUnoPool.filter((card) => !ownedMayhem.has(card.id))
        : [],
  };
}

function removePreservedFromPools(
  pools: SignalPools,
  preserved: readonly ShopOffer[],
): void {
  for (const offer of preserved) {
    if (offer.kind === "joker") {
      pools.jokers.splice(pools.jokers.indexOf(offer.jokerId), 1);
    } else if (offer.kind === "hand-upgrade") {
      pools.hands.splice(pools.hands.indexOf(offer.handType), 1);
    } else if (offer.kind === "protocol") {
      pools.protocols.splice(pools.protocols.indexOf(offer.protocolId), 1);
    } else if (offer.kind === "community-uno") {
      pools.mayhem.splice(
        pools.mayhem.findIndex((card) => card.id === offer.card.id),
        1,
      );
    }
  }
}

function poolHas(pools: SignalPools, kind: SignalKind): boolean {
  if (kind === "mod") return pools.jokers.length > 0;
  if (kind === "core") return pools.hands.length > 0;
  if (kind === "protocol") return pools.protocols.length > 0;
  return pools.mayhem.length > 0;
}

function chooseSignalKind(
  pools: SignalPools,
  rngState: number,
): { readonly kind: SignalKind; readonly rngState: number } {
  const candidates = (Object.keys(TODAY_SIGNAL_WEIGHTS) as SignalKind[]).filter(
    (kind) => poolHas(pools, kind),
  );
  const total = candidates.reduce(
    (sum, kind) => sum + TODAY_SIGNAL_WEIGHTS[kind],
    0,
  );
  const roll = nextRandom(rngState);
  let cursor = roll.value * total;
  for (const kind of candidates) {
    cursor -= TODAY_SIGNAL_WEIGHTS[kind];
    if (cursor <= 0) return { kind, rngState: roll.nextState };
  }
  return { kind: candidates[candidates.length - 1], rngState: roll.nextState };
}

function createSignalOffer(
  state: RunState,
  pools: SignalPools,
  kind: SignalKind,
  rerolls: number,
  index: number,
  initialRngState: number,
): { readonly offer: ShopOffer; readonly rngState: number } {
  if (kind === "mod") {
    const selected = chooseWeightedJoker(pools.jokers, initialRngState);
    pools.jokers.splice(pools.jokers.indexOf(selected.jokerId), 1);
    return {
      offer: {
        id: `shop-${state.roundNumber}-${rerolls}-signal-${index}-joker-${selected.jokerId}`,
        kind: "joker",
        price: JOKER_CATALOG[selected.jokerId].price,
        jokerId: selected.jokerId,
      },
      rngState: selected.rngState,
    };
  }

  if (kind === "core") {
    const selected = randomInt(initialRngState, 0, pools.hands.length);
    const [handType] = pools.hands.splice(selected.value, 1);
    return {
      offer: {
        id: `shop-${state.roundNumber}-${rerolls}-signal-${index}-core-${handType}`,
        kind: "hand-upgrade",
        price: 3 + Math.floor((state.handLevels[handType] - 1) / 3),
        handType,
      },
      rngState: selected.nextState,
    };
  }

  if (kind === "protocol") {
    const selected = randomInt(initialRngState, 0, pools.protocols.length);
    const [protocolId] = pools.protocols.splice(selected.value, 1);
    return {
      offer: {
        id: `shop-${state.roundNumber}-${rerolls}-signal-${index}-protocol-${protocolId}`,
        kind: "protocol",
        price: PROTOCOL_CONFIG[protocolId].price,
        protocolId,
      },
      rngState: selected.nextState,
    };
  }

  const selected = randomInt(initialRngState, 0, pools.mayhem.length);
  const [card] = pools.mayhem.splice(selected.value, 1);
  return {
    offer: {
      id: `shop-${state.roundNumber}-${rerolls}-signal-${index}-mayhem-${card.id}`,
      kind: "community-uno",
      price: state.roundNumber === 1 ? 3 : 4,
      card,
    },
    rngState: selected.nextState,
  };
}

function equippedMayhemGuarantee(
  state: RunState,
): RunState["communityUnoPool"][number] | undefined {
  if (state.roundNumber !== 1 || state.communityUno.length === 0) return undefined;
  const owned = new Set(state.communityUno.map((card) => card.id));
  const available = state.communityUnoPool.filter((card) => !owned.has(card.id));
  // The start screen intentionally narrows the pool to starter + equipped.
  return available.length === 1 ? available[0] : undefined;
}

function generateSignalOffers(
  state: RunState,
  rerolls: number,
  initialRngState: number,
  preserved: readonly ShopOffer[] = [],
  includeFirstShopGuarantee = false,
): {
  readonly offers: readonly ShopOffer[];
  readonly lockedOfferIds: readonly string[];
  readonly rngState: number;
} {
  const pools = createSignalPools(state);
  removePreservedFromPools(pools, preserved);
  const offers = [...preserved];
  const lockedOfferIds = preserved.map((offer) => offer.id);
  let rngState = initialRngState;

  if (includeFirstShopGuarantee && offers.length < GARAGE_OFFER_COUNTS.signal) {
    const card = equippedMayhemGuarantee(state);
    if (card && pools.mayhem.some((candidate) => candidate.id === card.id)) {
      const offer: ShopOffer = {
        id: `shop-${state.roundNumber}-signal-locked-mayhem-${card.id}`,
        kind: "community-uno",
        price: 3,
        card,
      };
      offers.push(offer);
      lockedOfferIds.push(offer.id);
      pools.mayhem.splice(
        pools.mayhem.findIndex((candidate) => candidate.id === card.id),
        1,
      );
    }
  }

  // Early shops always retain a route into the core MOD-building loop.
  if (
    offers.length < GARAGE_OFFER_COUNTS.signal &&
    state.jokers.length < 2 &&
    !offers.some((offer) => offer.kind === "joker") &&
    pools.jokers.length > 0
  ) {
    const generated = createSignalOffer(
      state,
      pools,
      "mod",
      rerolls,
      offers.length,
      rngState,
    );
    offers.push(generated.offer);
    rngState = generated.rngState;
  }

  while (offers.length < GARAGE_OFFER_COUNTS.signal) {
    const selectedKind = chooseSignalKind(pools, rngState);
    rngState = selectedKind.rngState;
    const generated = createSignalOffer(
      state,
      pools,
      selectedKind.kind,
      rerolls,
      offers.length,
      rngState,
    );
    offers.push(generated.offer);
    rngState = generated.rngState;
  }

  return { offers, lockedOfferIds, rngState };
}

function generateFirmwareOffer(
  state: RunState,
  rngState: number,
): { readonly offer: ShopOffer; readonly rngState: number } {
  const available = (Object.keys(FIRMWARE_CONFIG) as FirmwareId[]).filter(
    (firmwareId) => canInstallFirmware(state, firmwareId),
  );
  // Reaching every stack cap is only realistic in deep endless mode. Keeping a
  // visible sold-out class is preferable to changing the Deck Lab shape.
  const pool = available.length > 0
    ? available
    : (Object.keys(FIRMWARE_CONFIG) as FirmwareId[]);
  const selected = randomInt(rngState, 0, pool.length);
  const firmwareId = pool[selected.value];
  return {
    offer: {
      id: `shop-${state.roundNumber}-firmware-${firmwareId}`,
      kind: "firmware",
      price: FIRMWARE_CONFIG[firmwareId].price,
      firmwareId,
    },
    rngState: selected.nextState,
  };
}

function generatePackOffers(
  state: RunState,
  initialRngState: number,
): { readonly offers: readonly ShopOffer[]; readonly rngState: number } {
  const available = [...PACK_KIND_WEIGHTS];
  const offers: ShopOffer[] = [];
  let rngState = initialRngState;
  for (let index = 0; index < GARAGE_OFFER_COUNTS.packs; index += 1) {
    const selected = choosePackKind(available, rngState);
    rngState = selected.rngState;
    available.splice(
      available.findIndex((candidate) => candidate.kind === selected.kind),
      1,
    );
    offers.push({
      id: `shop-${state.roundNumber}-pack-${index}-${selected.kind}`,
      kind: "card-pack",
      price: packPriceFor(state, CARD_PACK_CONFIG[selected.kind].price),
      packKind: selected.kind,
    });
  }
  return { offers, rngState };
}

function isSignalOffer(offer: ShopOffer): boolean {
  return (
    offer.kind === "joker" ||
    offer.kind === "hand-upgrade" ||
    offer.kind === "protocol" ||
    offer.kind === "community-uno"
  );
}

export function generateShop(
  state: RunState,
  rerolls = 0,
): { readonly shop: ShopState; readonly rngState: number } {
  const signal = generateSignalOffers(
    state,
    rerolls,
    state.rngState,
    [],
    rerolls === 0,
  );
  const firmware = generateFirmwareOffer(state, signal.rngState);
  const packs = generatePackOffers(state, firmware.rngState);
  const offers = [...signal.offers, firmware.offer, ...packs.offers];

  return {
    shop: {
      id: `shop-${state.runId}-${state.roundNumber}-${rerolls}`,
      offers,
      signalOfferIds: signal.offers.map((offer) => offer.id),
      deckLabOfferId: firmware.offer.id,
      packOfferIds: packs.offers.map((offer) => offer.id),
      lockedSignalOfferIds: signal.lockedOfferIds,
      soldOfferIds: [],
      rerollCost: rerollBaseCostFor(state) + rerolls,
      rerolls,
    },
    rngState: packs.rngState,
  };
}

/** Replaces only Today's Signal. Deck Lab and Pack Bay retain IDs and SOLD state. */
export function rerollShopSignals(
  state: RunState,
  rerolls: number,
): { readonly shop: ShopState; readonly rngState: number } {
  const current = state.shop;
  if (!current) throw new Error("상점 정보가 없습니다.");
  const signalIds = new Set(
    current.signalOfferIds ?? current.offers.filter(isSignalOffer).map((offer) => offer.id),
  );
  const soldIds = new Set(current.soldOfferIds ?? []);
  const lockedIds = new Set(current.lockedSignalOfferIds ?? []);
  const preservedLocked = current.offers.filter(
    (offer) => signalIds.has(offer.id) && lockedIds.has(offer.id) && !soldIds.has(offer.id),
  );
  const fixedOffers = current.offers.filter((offer) => !signalIds.has(offer.id));
  const signal = generateSignalOffers(
    state,
    rerolls,
    state.rngState,
    preservedLocked,
    false,
  );
  const fixedIds = new Set(fixedOffers.map((offer) => offer.id));

  return {
    shop: {
      id: `shop-${state.runId}-${state.roundNumber}-${rerolls}`,
      offers: [...signal.offers, ...fixedOffers],
      signalOfferIds: signal.offers.map((offer) => offer.id),
      deckLabOfferId:
        current.deckLabOfferId ??
        fixedOffers.find(
          (offer) => offer.kind === "firmware" || offer.kind === "deck-work",
        )?.id,
      packOfferIds:
        current.packOfferIds ??
        fixedOffers.filter((offer) => offer.kind === "card-pack").map((offer) => offer.id),
      lockedSignalOfferIds: signal.lockedOfferIds,
      soldOfferIds: [...soldIds].filter((id) => fixedIds.has(id)),
      rerollCost: rerollBaseCostFor(state) + rerolls,
      rerolls,
    },
    rngState: signal.rngState,
  };
}
