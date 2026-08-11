import {
  HAND_TYPES,
  type CardPackKind,
  type DeckWorkKind,
  type HandType,
  type JokerId,
  type JokerRarity,
  type RunState,
  type ShopOffer,
  type ShopState,
} from "./types";
import {
  CARD_COLORS,
  JOKER_CATALOG,
  JOKER_IDS,
} from "./constants";
import {
  CARD_PACK_CONFIG,
  DECK_WORK_CONFIG,
  GARAGE_OFFER_COUNTS,
} from "./garage-config";
import { nextRandom, randomInt } from "./rng";

const RARITY_WEIGHT: Readonly<Record<JokerRarity, number>> = {
  common: 65,
  uncommon: 28,
  rare: 7,
};

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

export function generateShop(
  state: RunState,
  rerolls = 0,
): { readonly shop: ShopState; readonly rngState: number } {
  let rngState = state.rngState;
  const offers: ShopOffer[] = [];
  const ownedJokers = new Set(state.jokers.map((joker) => joker.jokerId));
  const availableJokers = JOKER_IDS.filter(
    (jokerId) => !ownedJokers.has(jokerId),
  );

  for (
    let index = 0;
    index < GARAGE_OFFER_COUNTS.mods && availableJokers.length > 0;
    index += 1
  ) {
    const selected = chooseWeightedJoker(availableJokers, rngState);
    rngState = selected.rngState;
    const candidateIndex = availableJokers.indexOf(selected.jokerId);
    availableJokers.splice(candidateIndex, 1);
    const definition = JOKER_CATALOG[selected.jokerId];
    offers.push({
      id: `shop-${state.roundNumber}-${rerolls}-joker-${index}-${selected.jokerId}`,
      kind: "joker",
      price: definition.price,
      jokerId: selected.jokerId,
    });
  }

  const availableDeckWork = Object.keys(DECK_WORK_CONFIG) as DeckWorkKind[];
  for (
    let index = 0;
    index < GARAGE_OFFER_COUNTS.deckWork && availableDeckWork.length > 0;
    index += 1
  ) {
    const selected = randomInt(rngState, 0, availableDeckWork.length);
    rngState = selected.nextState;
    const [work] = availableDeckWork.splice(selected.value, 1);
    let targetColor;
    if (work === "recolor") {
      const colorRoll = randomInt(rngState, 0, CARD_COLORS.length);
      rngState = colorRoll.nextState;
      targetColor = CARD_COLORS[colorRoll.value];
    }
    offers.push({
      id: `shop-${state.roundNumber}-${rerolls}-deck-${index}-${work}`,
      kind: "deck-work",
      price: DECK_WORK_CONFIG[work].price,
      work,
      ...(targetColor ? { targetColor } : {}),
    });
  }

  const handCandidates: HandType[] = [...HAND_TYPES];
  for (
    let index = 0;
    index < GARAGE_OFFER_COUNTS.pattern && handCandidates.length > 0;
    index += 1
  ) {
    const selected = randomInt(rngState, 0, handCandidates.length);
    rngState = selected.nextState;
    const [handType] = handCandidates.splice(selected.value, 1);
    const price = 3 + Math.floor((state.handLevels[handType] - 1) / 3);
    offers.push({
      id: `shop-${state.roundNumber}-${rerolls}-upgrade-${index}-${handType}`,
      kind: "hand-upgrade",
      price,
      handType,
    });
  }

  const ownedUno = new Set(state.communityUno.map((card) => card.id));
  const availableUno = state.communityUnoPool.filter(
    (card) => !ownedUno.has(card.id),
  );
  for (
    let index = 0;
    index < GARAGE_OFFER_COUNTS.mayhem && availableUno.length > 0;
    index += 1
  ) {
    const selected = randomInt(rngState, 0, availableUno.length);
    rngState = selected.nextState;
    const [card] = availableUno.splice(selected.value, 1);
    offers.push({
      id: `shop-${state.roundNumber}-${rerolls}-uno-${index}-${card.id}`,
      kind: "community-uno",
      price: state.roundNumber === 1 ? 3 : 4,
      card,
    });
  }

  const packRoll = randomInt(rngState, 0, 100);
  rngState = packRoll.nextState;
  const packKind: CardPackKind = packRoll.value < 70 ? "supply" : "glitch";
  offers.push({
    id: `shop-${state.roundNumber}-${rerolls}-pack-${packKind}`,
    kind: "card-pack",
    price: CARD_PACK_CONFIG[packKind].price,
    packKind,
  });

  return {
    shop: {
      id: `shop-${state.runId}-${state.roundNumber}-${rerolls}`,
      offers,
      rerollCost: 2 + rerolls,
      rerolls,
    },
    rngState,
  };
}
