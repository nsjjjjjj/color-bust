import { CARD_COLORS, JOKER_CATALOG, JOKER_IDS } from "./constants";
import { nextRandom, randomInt } from "./rng";
import type {
  CardEnhancement,
  CardPackKind,
  CardRank,
  CardRarity,
  GameCard,
  JokerId,
  PackChoice,
} from "./types";

export interface PackDefinition {
  readonly revealCount: number;
  readonly pickCount: number;
  readonly contents: "card" | "modifier" | "upgrade";
  readonly weights: Readonly<Record<CardRarity, number>>;
}

export const RARITY_ORDER: readonly CardRarity[] = [
  "common",
  "uncommon",
  "rare",
  "legendary",
];

export const PACK_DEFINITIONS: Readonly<Record<CardPackKind, PackDefinition>> = {
  standard: {
    revealCount: 3,
    pickCount: 1,
    contents: "card",
    weights: { common: 70, uncommon: 25, rare: 5, legendary: 0 },
  },
  large: {
    revealCount: 5,
    pickCount: 2,
    contents: "card",
    weights: { common: 60, uncommon: 28, rare: 10, legendary: 2 },
  },
  premium: {
    revealCount: 5,
    pickCount: 2,
    contents: "card",
    weights: { common: 40, uncommon: 40, rare: 18, legendary: 2 },
  },
  modifier: {
    revealCount: 3,
    pickCount: 1,
    contents: "modifier",
    weights: { common: 62, uncommon: 28, rare: 8, legendary: 2 },
  },
  upgrade: {
    revealCount: 3,
    pickCount: 1,
    contents: "upgrade",
    weights: { common: 55, uncommon: 30, rare: 13, legendary: 2 },
  },
  supply: {
    revealCount: 3,
    pickCount: 1,
    contents: "card",
    weights: { common: 70, uncommon: 25, rare: 5, legendary: 0 },
  },
  glitch: {
    revealCount: 5,
    pickCount: 2,
    contents: "card",
    weights: { common: 40, uncommon: 40, rare: 18, legendary: 2 },
  },
};

const UPGRADE_RARITY: Readonly<Record<CardEnhancement, CardRarity>> = {
  minted: "common",
  charged: "uncommon",
  amplified: "rare",
  overclocked: "legendary",
};

function modifierRarity(jokerId: JokerId): CardRarity {
  if (jokerId === "null-pointer") return "legendary";
  return JOKER_CATALOG[jokerId].rarity;
}

function availableWeightedRarity(
  weights: Readonly<Record<CardRarity, number>>,
  available: ReadonlySet<CardRarity>,
  rngState: number,
): { readonly rarity: CardRarity; readonly rngState: number } {
  const total = RARITY_ORDER.reduce(
    (sum, rarity) => sum + (available.has(rarity) ? weights[rarity] : 0),
    0,
  );
  if (total <= 0) {
    const fallback = RARITY_ORDER.find((rarity) => available.has(rarity));
    if (!fallback) throw new Error("팩에 남은 희귀도 풀이 없습니다.");
    return { rarity: fallback, rngState };
  }
  const roll = nextRandom(rngState);
  let cursor = roll.value * total;
  for (const rarity of RARITY_ORDER) {
    if (!available.has(rarity)) continue;
    cursor -= weights[rarity];
    if (cursor <= 0) return { rarity, rngState: roll.nextState };
  }
  return {
    rarity: RARITY_ORDER.findLast((rarity) => available.has(rarity))!,
    rngState: roll.nextState,
  };
}

function enhancementForRarity(
  rarity: CardRarity,
  rngState: number,
): { readonly enhancement?: CardEnhancement; readonly rngState: number } {
  if (rarity === "common") return { rngState };
  if (rarity === "uncommon") {
    const roll = randomInt(rngState, 0, 2);
    return {
      enhancement: roll.value === 0 ? "charged" : "minted",
      rngState: roll.nextState,
    };
  }
  if (rarity === "rare") return { enhancement: "amplified", rngState };
  return { enhancement: "overclocked", rngState };
}

function generateCardChoices(
  packKind: CardPackKind,
  idPrefix: string,
  initialRngState: number,
): { readonly choices: readonly PackChoice[]; readonly rngState: number } {
  const definition = PACK_DEFINITIONS[packKind];
  const basePool = CARD_COLORS.flatMap((color) =>
    Array.from({ length: 10 }, (_, rank) => ({ color, rank: rank as CardRank })),
  );
  let rngState = initialRngState;
  const choices: PackChoice[] = [];

  for (let index = 0; index < definition.revealCount; index += 1) {
    const rarityRoll = availableWeightedRarity(
      definition.weights,
      new Set(RARITY_ORDER),
      rngState,
    );
    rngState = rarityRoll.rngState;
    const baseRoll = randomInt(rngState, 0, basePool.length);
    rngState = baseRoll.nextState;
    const [base] = basePool.splice(baseRoll.value, 1);
    const enhancementRoll = enhancementForRarity(rarityRoll.rarity, rngState);
    rngState = enhancementRoll.rngState;
    const card: GameCard = {
      id: `${idPrefix}-card-${index}-${base.color}-${base.rank}`,
      color: base.color,
      rank: base.rank,
      rarity: rarityRoll.rarity,
      ...(enhancementRoll.enhancement
        ? { enhancement: enhancementRoll.enhancement }
        : {}),
    };
    choices.push({
      id: `${idPrefix}-choice-${index}`,
      kind: "card",
      rarity: rarityRoll.rarity,
      card,
    });
  }
  return { choices, rngState };
}

function generateModifierChoices(
  packKind: CardPackKind,
  idPrefix: string,
  initialRngState: number,
): { readonly choices: readonly PackChoice[]; readonly rngState: number } {
  const definition = PACK_DEFINITIONS[packKind];
  const pool = [...JOKER_IDS];
  let rngState = initialRngState;
  const choices: PackChoice[] = [];

  for (let index = 0; index < definition.revealCount; index += 1) {
    const availableRarities = new Set(
      pool.map((jokerId) => modifierRarity(jokerId)),
    );
    const rarityRoll = availableWeightedRarity(
      definition.weights,
      availableRarities,
      rngState,
    );
    rngState = rarityRoll.rngState;
    const candidates = pool.filter(
      (jokerId) => modifierRarity(jokerId) === rarityRoll.rarity,
    );
    const candidateRoll = randomInt(rngState, 0, candidates.length);
    rngState = candidateRoll.nextState;
    const jokerId = candidates[candidateRoll.value];
    pool.splice(pool.indexOf(jokerId), 1);
    choices.push({
      id: `${idPrefix}-choice-${index}-${jokerId}`,
      kind: "modifier",
      rarity: rarityRoll.rarity,
      jokerId,
    });
  }
  return { choices, rngState };
}

function generateUpgradeChoices(
  packKind: CardPackKind,
  idPrefix: string,
  initialRngState: number,
): { readonly choices: readonly PackChoice[]; readonly rngState: number } {
  const definition = PACK_DEFINITIONS[packKind];
  const pool = Object.keys(UPGRADE_RARITY) as CardEnhancement[];
  let rngState = initialRngState;
  const choices: PackChoice[] = [];

  for (let index = 0; index < definition.revealCount; index += 1) {
    const availableRarities = new Set(
      pool.map((enhancement) => UPGRADE_RARITY[enhancement]),
    );
    const rarityRoll = availableWeightedRarity(
      definition.weights,
      availableRarities,
      rngState,
    );
    rngState = rarityRoll.rngState;
    const candidates = pool.filter(
      (enhancement) => UPGRADE_RARITY[enhancement] === rarityRoll.rarity,
    );
    const candidateRoll = randomInt(rngState, 0, candidates.length);
    rngState = candidateRoll.nextState;
    const enhancement = candidates[candidateRoll.value];
    pool.splice(pool.indexOf(enhancement), 1);
    choices.push({
      id: `${idPrefix}-choice-${index}-${enhancement}`,
      kind: "upgrade",
      rarity: rarityRoll.rarity,
      enhancement,
    });
  }
  return { choices, rngState };
}

export const PackGenerator = {
  generate(
    packKind: CardPackKind,
    idPrefix: string,
    rngState: number,
  ): { readonly choices: readonly PackChoice[]; readonly rngState: number } {
    const contents = PACK_DEFINITIONS[packKind].contents;
    if (contents === "modifier") {
      return generateModifierChoices(packKind, idPrefix, rngState);
    }
    if (contents === "upgrade") {
      return generateUpgradeChoices(packKind, idPrefix, rngState);
    }
    return generateCardChoices(packKind, idPrefix, rngState);
  },
} as const;
