import {
  CARD_COLORS,
  DEFAULT_COMMUNITY_UNO_CARDS,
  DISCARDS_PER_ROUND,
  HANDS_PER_ROUND,
  JOKER_CATALOG,
  JOKER_SLOT_LIMIT,
  MAX_PLAY_CARDS,
  ROUND_REWARDS,
  STARTING_HAND_SIZE,
  UNO_SLOT_LIMIT,
  targetForRound,
} from "./constants";
import { drawCards, shuffledDeck } from "./deck";
import {
  CARD_ENHANCEMENT_CONFIG,
  MINIMUM_RUN_DECK_SIZE,
  RESERVE_BONUS_CAP,
  RESERVE_BONUS_STEP,
  UNUSED_HAND_BONUS_CAP,
} from "./garage-config";
import { hashSeed, randomInt, shuffle } from "./rng";
import { calculateHandScore } from "./scoring";
import { generateShop } from "./shop";
import {
  HAND_TYPES,
  GameRuleError,
  type CardColor,
  type CardRank,
  type CreateRunOptions,
  type GameCard,
  type HandType,
  type JokerInstance,
  type PlayHandOptions,
  type PlayHandResult,
  type RunActionRecord,
  type RunActionType,
  type RunState,
  type ShopOffer,
  type ScoreBreakdown,
} from "./types";
import { assertValidCommunityUnoCard } from "./uno";

function initialHandLevels(): Readonly<Record<HandType, number>> {
  return Object.fromEntries(HAND_TYPES.map((type) => [type, 1])) as Record<
    HandType,
    number
  >;
}

function ensurePhase(state: RunState, expected: RunState["phase"]): void {
  if (state.phase !== expected) {
    throw new GameRuleError(
      "INVALID_PHASE",
      `이 행동은 ${expected} 단계에서만 가능합니다. 현재 단계: ${state.phase}`,
    );
  }
}

function addAction(
  state: RunState,
  type: RunActionType,
  payload: RunActionRecord["payload"],
): RunState {
  return {
    ...state,
    actionLog: [
      ...state.actionLog,
      { sequence: state.actionLog.length + 1, type, payload },
    ],
  };
}

/**
 * `deck` became authoritative after v1 shipped. Legacy saves are recovered from
 * the three round zones without changing their current round or RNG state.
 */
function persistentDeck(state: RunState): readonly GameCard[] {
  const source = state.deck?.length
    ? state.deck
    : [...state.hand, ...state.drawPile, ...state.discardPile];
  const unique = new Map<string, GameCard>();
  for (const card of source) unique.set(card.id, card);
  return [...unique.values()];
}

function updateCardEverywhere(
  state: RunState,
  cardId: string,
  update: (card: GameCard) => GameCard,
): Pick<RunState, "deck" | "hand" | "drawPile" | "discardPile"> {
  const apply = (cards: readonly GameCard[]) =>
    cards.map((card) => (card.id === cardId ? update(card) : card));
  return {
    deck: apply(persistentDeck(state)),
    hand: apply(state.hand),
    drawPile: apply(state.drawPile),
    discardPile: apply(state.discardPile),
  };
}

function removeCardEverywhere(
  state: RunState,
  cardId: string,
): Pick<RunState, "deck" | "hand" | "drawPile" | "discardPile"> {
  const without = (cards: readonly GameCard[]) =>
    cards.filter((card) => card.id !== cardId);
  return {
    deck: without(persistentDeck(state)),
    hand: without(state.hand),
    drawPile: without(state.drawPile),
    discardPile: without(state.discardPile),
  };
}

function roundRewardFor(
  state: RunState,
  handsLeft: number,
  modIncome: number,
  finalBoss: boolean,
): NonNullable<RunState["pendingReward"]> {
  const baseCoins = ROUND_REWARDS[state.round];
  const handBonus = Math.min(UNUSED_HAND_BONUS_CAP, handsLeft);
  const reserveBonus = Math.min(
    RESERVE_BONUS_CAP,
    Math.floor(state.coins / RESERVE_BONUS_STEP),
  );
  return {
    baseCoins,
    handBonus,
    reserveBonus,
    modIncome,
    total: baseCoins + handBonus + reserveBonus + modIncome,
    nextPhase: finalBoss ? "won" : "shop",
  };
}

function selectedCardsFromHand(
  state: RunState,
  cardIds: readonly string[],
  maximum = MAX_PLAY_CARDS,
): readonly GameCard[] {
  if (cardIds.length < 1 || cardIds.length > maximum) {
    throw new GameRuleError(
      "INVALID_CARD_COUNT",
      `카드는 1장부터 ${maximum}장까지 선택할 수 있습니다.`,
    );
  }
  if (new Set(cardIds).size !== cardIds.length) {
    throw new GameRuleError("DUPLICATE_CARD", "같은 카드를 두 번 선택했습니다.");
  }

  const byId = new Map(state.hand.map((card) => [card.id, card]));
  return cardIds.map((cardId) => {
    const card = byId.get(cardId);
    if (!card) {
      throw new GameRuleError(
        "CARD_NOT_IN_HAND",
        `${cardId} 카드는 현재 손패에 없습니다.`,
      );
    }
    return card;
  });
}

function replaceSelectedCards(
  state: RunState,
  selectedCards: readonly GameCard[],
): Pick<RunState, "hand" | "drawPile" | "discardPile" | "rngState"> {
  const selectedIds = new Set(selectedCards.map((card) => card.id));
  const remainingHand = state.hand.filter((card) => !selectedIds.has(card.id));
  const draw = drawCards(
    state.drawPile,
    [...state.discardPile, ...selectedCards],
    selectedCards.length,
    state.rngState,
  );

  return {
    hand: [...remainingHand, ...draw.drawn],
    drawPile: draw.drawPile,
    discardPile: draw.discardPile,
    rngState: draw.rngState,
  };
}

function uniqueAndValidatedUnoPool(
  cards: readonly RunState["communityUnoPool"][number][],
): readonly RunState["communityUnoPool"][number][] {
  const ids = new Set<string>();
  for (const card of cards) {
    assertValidCommunityUnoCard(card);
    if (ids.has(card.id)) {
      throw new GameRuleError(
        "DUPLICATE_UNO_ID",
        `커뮤니티 UNO ID가 중복되었습니다: ${card.id}`,
      );
    }
    ids.add(card.id);
  }
  return [...cards];
}

export function createRun(options: CreateRunOptions = {}): RunState {
  const seed = String(options.seed ?? "color-bust");
  const initialRngState = hashSeed(seed);
  const shuffled = shuffledDeck(initialRngState);
  const firstDraw = drawCards(
    shuffled.deck,
    [],
    STARTING_HAND_SIZE,
    shuffled.rngState,
  );
  const pool = uniqueAndValidatedUnoPool(
    options.communityUnoPool ?? DEFAULT_COMMUNITY_UNO_CARDS,
  );

  let communityUno: RunState["communityUno"] = [];
  if (options.starterUno) {
    assertValidCommunityUnoCard(options.starterUno);
    communityUno = [options.starterUno];
  }

  return {
    version: 1,
    runId: `cb-${hashSeed(`${seed}:${options.mode ?? "standard"}`).toString(36)}`,
    seed,
    rngState: firstDraw.rngState,
    phase: "playing",
    mode: options.mode ?? "standard",
    ante: 1,
    round: "small",
    roundNumber: 1,
    hand: firstDraw.drawn,
    drawPile: firstDraw.drawPile,
    discardPile: firstDraw.discardPile,
    deck: shuffled.deck,
    score: 0,
    target: targetForRound(1, "small"),
    handsLeft: HANDS_PER_ROUND,
    discardsLeft: DISCARDS_PER_ROUND,
    coins: Math.max(0, Math.floor(options.startingCoins ?? 10)),
    roundIncome: 0,
    jokers: [],
    communityUno,
    communityUnoPool: pool,
    unoUsedThisAnte: false,
    handLevels: initialHandLevels(),
    handHistory: [],
    shop: null,
    packOpening: null,
    pendingReward: null,
    stats: {
      handsPlayed: 0,
      cardsDiscarded: 0,
      roundsCleared: 0,
      highestHandScore: 0,
      totalScore: 0,
      unoUses: 0,
    },
    actionLog: [],
  };
}

export function playHand(
  state: RunState,
  cardIds: readonly string[],
  options: PlayHandOptions = {},
): PlayHandResult {
  ensurePhase(state, "playing");
  if (state.handsLeft <= 0) {
    throw new GameRuleError("NO_HANDS_LEFT", "남은 핸드가 없습니다.");
  }

  const selectedCards = selectedCardsFromHand(state, cardIds);
  const calculated = calculateHandScore(state, selectedCards, options);
  const replacement = replaceSelectedCards(state, selectedCards);
  const newScore = state.score + calculated.breakdown.total;
  const handsLeft = state.handsLeft - 1;
  const roundCleared = newScore >= state.target;
  const isStandardFinalBoss =
    state.mode === "standard" && state.ante === 5 && state.round === "boss";
  const roundIncome = (state.roundIncome ?? 0) + calculated.breakdown.coinGain;
  const pendingReward = roundCleared
    ? roundRewardFor(state, handsLeft, roundIncome, isStandardFinalBoss)
    : null;
  const roundReward = pendingReward?.total ?? 0;

  let nextState: RunState = {
    ...state,
    ...replacement,
    phase: roundCleared
      ? "reward"
      : handsLeft === 0
        ? "lost"
        : "playing",
    score: newScore,
    handsLeft,
    coins: state.coins,
    roundIncome: roundCleared ? 0 : roundIncome,
    jokers: calculated.updatedJokers,
    unoUsedThisAnte:
      state.unoUsedThisAnte || calculated.usedUnoCardId !== undefined,
    handHistory: [...state.handHistory, calculated.breakdown.handType],
    shop: null,
    packOpening: null,
    pendingReward,
    stats: {
      ...state.stats,
      handsPlayed: state.stats.handsPlayed + 1,
      roundsCleared: state.stats.roundsCleared + (roundCleared ? 1 : 0),
      highestHandScore: Math.max(
        state.stats.highestHandScore,
        calculated.breakdown.total,
      ),
      totalScore: state.stats.totalScore + calculated.breakdown.total,
      unoUses:
        state.stats.unoUses + (calculated.usedUnoCardId !== undefined ? 1 : 0),
    },
  };

  nextState = addAction(nextState, "play-hand", {
    cardIds: [...cardIds],
    score: calculated.breakdown.total,
    handType: calculated.breakdown.handType,
    ...(options.unoCardId ? { unoCardId: options.unoCardId } : {}),
    ...(options.calledColor ? { calledColor: options.calledColor } : {}),
  });

  return {
    state: nextState,
    breakdown: { ...calculated.breakdown, roundReward },
    roundCleared,
    runEnded: nextState.phase === "won" || nextState.phase === "lost",
  };
}

/** Pays a saved reward receipt exactly once, then opens the Garage or win view. */
export function claimRoundReward(state: RunState): RunState {
  ensurePhase(state, "reward");
  const reward = state.pendingReward;
  if (!reward) {
    throw new GameRuleError("REWARD_NOT_FOUND", "수령할 라운드 보상이 없습니다.");
  }

  let nextState = addAction(
    {
      ...state,
      phase: reward.nextPhase,
      coins: state.coins + reward.total,
      roundIncome: 0,
      pendingReward: null,
      packOpening: null,
      shop: null,
    },
    "claim-reward",
    {
      baseCoins: reward.baseCoins,
      handBonus: reward.handBonus,
      reserveBonus: reward.reserveBonus,
      modIncome: reward.modIncome,
      total: reward.total,
    },
  );

  if (nextState.phase === "shop") {
    const generated = generateShop(nextState);
    nextState = {
      ...nextState,
      rngState: generated.rngState,
      shop: generated.shop,
    };
  }
  return nextState;
}

/**
 * Calculates the exact result the play would produce without changing RunState,
 * consuming RNG, or marking an UNO card as used.
 */
export function previewHand(
  state: RunState,
  cardIds: readonly string[],
  options: PlayHandOptions = {},
): ScoreBreakdown {
  ensurePhase(state, "playing");
  const selectedCards = selectedCardsFromHand(state, cardIds);
  return calculateHandScore(state, selectedCards, options).breakdown;
}

export function discardCards(
  state: RunState,
  cardIds: readonly string[],
): RunState {
  ensurePhase(state, "playing");
  if (state.discardsLeft <= 0) {
    throw new GameRuleError("NO_DISCARDS_LEFT", "남은 버리기가 없습니다.");
  }

  const selectedCards = selectedCardsFromHand(state, cardIds);
  const replacement = replaceSelectedCards(state, selectedCards);
  return addAction(
    {
      ...state,
      ...replacement,
      discardsLeft: state.discardsLeft - 1,
      stats: {
        ...state.stats,
        cardsDiscarded: state.stats.cardsDiscarded + selectedCards.length,
      },
    },
    "discard",
    { cardIds: [...cardIds] },
  );
}

function findOffer(state: RunState, offerId: string): ShopOffer {
  ensurePhase(state, "shop");
  if (state.packOpening) {
    throw new GameRuleError(
      "PACK_CHOICE_REQUIRED",
      "열린 카드 팩에서 먼저 카드 1장을 선택해야 합니다.",
    );
  }
  const offer = state.shop?.offers.find((candidate) => candidate.id === offerId);
  if (!offer) {
    throw new GameRuleError("OFFER_NOT_FOUND", "상점 상품을 찾을 수 없습니다.");
  }
  return offer;
}

function payAndRemoveOffer(
  state: RunState,
  offer: ShopOffer,
): Pick<RunState, "coins" | "shop"> {
  if (state.coins < offer.price) {
    throw new GameRuleError("NOT_ENOUGH_COINS", "코인이 부족합니다.");
  }
  return {
    coins: state.coins - offer.price,
    shop: state.shop
      ? {
          ...state.shop,
          offers: state.shop.offers.filter(
            (candidate) => candidate.id !== offer.id,
          ),
        }
      : null,
  };
}

export function buyJoker(state: RunState, offerId: string): RunState {
  const offer = findOffer(state, offerId);
  if (offer.kind !== "joker") {
    throw new GameRuleError("NOT_A_JOKER", "이 상품은 조커가 아닙니다.");
  }
  if (state.jokers.length >= JOKER_SLOT_LIMIT) {
    throw new GameRuleError("JOKER_SLOTS_FULL", "조커 슬롯이 가득 찼습니다.");
  }
  if (state.jokers.some((joker) => joker.jokerId === offer.jokerId)) {
    throw new GameRuleError("JOKER_ALREADY_OWNED", "이미 보유한 조커입니다.");
  }

  const purchase = payAndRemoveOffer(state, offer);
  const instance: JokerInstance = {
    instanceId: `joker-${state.runId}-${state.actionLog.length + 1}-${offer.jokerId}`,
    jokerId: offer.jokerId,
    acquiredRound: state.roundNumber,
    ...(offer.jokerId === "combo-compiler" ? { counter: 0 } : {}),
  };
  return addAction(
    {
      ...state,
      ...purchase,
      jokers: [...state.jokers, instance],
    },
    "buy-joker",
    { offerId, jokerId: offer.jokerId, price: offer.price },
  );
}

export function buyUnoCard(state: RunState, offerId: string): RunState {
  const offer = findOffer(state, offerId);
  if (offer.kind !== "community-uno") {
    throw new GameRuleError("NOT_AN_UNO_CARD", "이 상품은 UNO 카드가 아닙니다.");
  }
  if (state.communityUno.length >= UNO_SLOT_LIMIT) {
    throw new GameRuleError("UNO_SLOTS_FULL", "커뮤니티 UNO 슬롯이 가득 찼습니다.");
  }
  if (state.communityUno.some((card) => card.id === offer.card.id)) {
    throw new GameRuleError("UNO_ALREADY_OWNED", "이미 보유한 UNO 카드입니다.");
  }
  assertValidCommunityUnoCard(offer.card);

  const purchase = payAndRemoveOffer(state, offer);
  return addAction(
    {
      ...state,
      ...purchase,
      communityUno: [...state.communityUno, offer.card],
    },
    "buy-uno",
    { offerId, cardId: offer.card.id, price: offer.price },
  );
}

export function buyHandUpgrade(state: RunState, offerId: string): RunState {
  const offer = findOffer(state, offerId);
  if (offer.kind !== "hand-upgrade") {
    throw new GameRuleError(
      "NOT_A_HAND_UPGRADE",
      "이 상품은 족보 강화가 아닙니다.",
    );
  }

  const purchase = payAndRemoveOffer(state, offer);
  return addAction(
    {
      ...state,
      ...purchase,
      handLevels: {
        ...state.handLevels,
        [offer.handType]: state.handLevels[offer.handType] + 1,
      },
    },
    "upgrade-hand",
    { offerId, handType: offer.handType, price: offer.price },
  );
}

function deckCardOrThrow(state: RunState, cardId: string): GameCard {
  const card = persistentDeck(state).find((candidate) => candidate.id === cardId);
  if (!card) {
    throw new GameRuleError("DECK_CARD_NOT_FOUND", "런 덱에서 대상 카드를 찾을 수 없습니다.");
  }
  return card;
}

export function buyDeckWork(
  state: RunState,
  offerId: string,
  targetCardId: string,
): RunState {
  const offer = findOffer(state, offerId);
  if (offer.kind !== "deck-work") {
    throw new GameRuleError("NOT_DECK_WORK", "이 상품은 덱 개조가 아닙니다.");
  }
  const target = deckCardOrThrow(state, targetCardId);
  const deck = persistentDeck(state);
  let changes: Pick<RunState, "deck" | "hand" | "drawPile" | "discardPile">;

  switch (offer.work) {
    case "remove":
      if (deck.length <= MINIMUM_RUN_DECK_SIZE) {
        throw new GameRuleError(
          "DECK_MINIMUM_REACHED",
          `런 덱은 최소 ${MINIMUM_RUN_DECK_SIZE}장을 유지해야 합니다.`,
        );
      }
      changes = removeCardEverywhere(state, target.id);
      break;
    case "clone": {
      const clone: GameCard = {
        ...target,
        id: `clone-${state.runId}-${state.actionLog.length + 1}-${target.id}`,
      };
      changes = {
        deck: [...deck, clone],
        hand: state.hand,
        drawPile: state.drawPile,
        discardPile: state.discardPile,
      };
      break;
    }
    case "recolor":
      if (!offer.targetColor) {
        throw new GameRuleError("RECOLOR_TARGET_MISSING", "변경할 색이 지정되지 않았습니다.");
      }
      if (target.color === offer.targetColor) {
        throw new GameRuleError("COLOR_UNCHANGED", "이미 같은 색인 카드입니다.");
      }
      changes = updateCardEverywhere(state, target.id, (card) => ({
        ...card,
        color: offer.targetColor!,
      }));
      break;
    case "shift-up":
      if (target.rank >= 9) {
        throw new GameRuleError("RANK_AT_MAXIMUM", "9 카드는 더 높일 수 없습니다.");
      }
      changes = updateCardEverywhere(state, target.id, (card) => ({
        ...card,
        rank: (card.rank + 1) as CardRank,
      }));
      break;
    case "shift-down":
      if (target.rank <= 0) {
        throw new GameRuleError("RANK_AT_MINIMUM", "0 카드는 더 낮출 수 없습니다.");
      }
      changes = updateCardEverywhere(state, target.id, (card) => ({
        ...card,
        rank: (card.rank - 1) as CardRank,
      }));
      break;
    case "charge":
    case "amplify": {
      if (target.enhancement) {
        throw new GameRuleError("CARD_ALREADY_ENHANCED", "이미 개조 효과가 있는 카드입니다.");
      }
      const enhancement = offer.work === "charge" ? "charged" : "amplified";
      changes = updateCardEverywhere(state, target.id, (card) => ({
        ...card,
        enhancement,
      }));
      break;
    }
  }

  const purchase = payAndRemoveOffer(state, offer);
  return addAction(
    { ...state, ...purchase, ...changes },
    "buy-deck-work",
    {
      offerId,
      work: offer.work,
      targetCardId,
      price: offer.price,
      ...(offer.targetColor ? { targetColor: offer.targetColor } : {}),
    },
  );
}

function generatePackChoices(
  state: RunState,
  offer: Extract<ShopOffer, { kind: "card-pack" }>,
): { readonly choices: readonly GameCard[]; readonly rngState: number } {
  let rngState = state.rngState;
  const choices: GameCard[] = [];
  const enhancements = Object.keys(CARD_ENHANCEMENT_CONFIG) as NonNullable<
    GameCard["enhancement"]
  >[];

  for (let index = 0; index < 3; index += 1) {
    const colorRoll = randomInt(rngState, 0, CARD_COLORS.length);
    rngState = colorRoll.nextState;
    const rankRoll = randomInt(rngState, 0, 10);
    rngState = rankRoll.nextState;
    let enhancement: GameCard["enhancement"];
    if (offer.packKind === "glitch") {
      const enhancementRoll = randomInt(rngState, 0, 2);
      rngState = enhancementRoll.nextState;
      enhancement = enhancementRoll.value === 0 ? "charged" : "amplified";
    } else {
      const enhancementRoll = randomInt(rngState, 0, enhancements.length);
      rngState = enhancementRoll.nextState;
      enhancement = enhancements[enhancementRoll.value];
    }
    choices.push({
      id: `pack-${state.runId}-${state.actionLog.length + 1}-${offer.packKind}-${index}`,
      color: CARD_COLORS[colorRoll.value],
      rank: rankRoll.value as CardRank,
      ...(enhancement ? { enhancement } : {}),
    });
  }
  return { choices, rngState };
}

export function buyCardPack(state: RunState, offerId: string): RunState {
  const offer = findOffer(state, offerId);
  if (offer.kind !== "card-pack") {
    throw new GameRuleError("NOT_A_CARD_PACK", "이 상품은 카드 팩이 아닙니다.");
  }
  const generated = generatePackChoices(state, offer);
  const purchase = payAndRemoveOffer(state, offer);
  return addAction(
    {
      ...state,
      ...purchase,
      rngState: generated.rngState,
      packOpening: {
        offerId,
        packKind: offer.packKind,
        choices: generated.choices,
      },
    },
    "buy-card-pack",
    { offerId, packKind: offer.packKind, price: offer.price },
  );
}

export function choosePackCard(state: RunState, cardId: string): RunState {
  ensurePhase(state, "shop");
  const opening = state.packOpening;
  if (!opening) {
    throw new GameRuleError("PACK_NOT_OPEN", "선택할 카드 팩이 없습니다.");
  }
  const card = opening.choices.find((candidate) => candidate.id === cardId);
  if (!card) {
    throw new GameRuleError("PACK_CARD_NOT_FOUND", "팩에서 선택한 카드를 찾을 수 없습니다.");
  }
  const deck = persistentDeck(state);
  if (deck.some((candidate) => candidate.id === card.id)) {
    throw new GameRuleError("DUPLICATE_CARD_ID", "이미 런 덱에 있는 카드입니다.");
  }
  return addAction(
    {
      ...state,
      deck: [...deck, card],
      packOpening: null,
    },
    "choose-pack-card",
    { cardId, packKind: opening.packKind },
  );
}

export function buyShopOffer(
  state: RunState,
  offerId: string,
  targetCardId?: string,
): RunState {
  const offer = findOffer(state, offerId);
  switch (offer.kind) {
    case "joker":
      return buyJoker(state, offerId);
    case "community-uno":
      return buyUnoCard(state, offerId);
    case "hand-upgrade":
      return buyHandUpgrade(state, offerId);
    case "deck-work":
      if (!targetCardId) {
        throw new GameRuleError("DECK_TARGET_REQUIRED", "개조할 덱 카드를 선택해야 합니다.");
      }
      return buyDeckWork(state, offerId, targetCardId);
    case "card-pack":
      return buyCardPack(state, offerId);
  }
}

export function sellJoker(state: RunState, instanceId: string): RunState {
  ensurePhase(state, "shop");
  const joker = state.jokers.find(
    (candidate) => candidate.instanceId === instanceId,
  );
  if (!joker) {
    throw new GameRuleError("JOKER_NOT_FOUND", "판매할 조커를 찾을 수 없습니다.");
  }

  const refund = Math.max(1, Math.floor(JOKER_CATALOG[joker.jokerId].price / 2));
  return addAction(
    {
      ...state,
      coins: state.coins + refund,
      jokers: state.jokers.filter(
        (candidate) => candidate.instanceId !== instanceId,
      ),
    },
    "sell-joker",
    { instanceId, jokerId: joker.jokerId, refund },
  );
}

export function rerollShop(state: RunState): RunState {
  ensurePhase(state, "shop");
  if (state.packOpening) {
    throw new GameRuleError(
      "PACK_CHOICE_REQUIRED",
      "열린 카드 팩에서 먼저 카드 1장을 선택해야 합니다.",
    );
  }
  if (!state.shop) {
    throw new GameRuleError("SHOP_NOT_FOUND", "상점 정보가 없습니다.");
  }
  if (state.coins < state.shop.rerollCost) {
    throw new GameRuleError("NOT_ENOUGH_COINS", "리롤할 코인이 부족합니다.");
  }

  const cost = state.shop.rerollCost;
  const rerolls = state.shop.rerolls + 1;
  const paidState = { ...state, coins: state.coins - cost };
  const generated = generateShop(paidState, rerolls);
  return addAction(
    {
      ...paidState,
      rngState: generated.rngState,
      shop: generated.shop,
    },
    "reroll-shop",
    { cost, rerolls },
  );
}

export function setHotSwapColor(
  state: RunState,
  color: CardColor,
  instanceId?: string,
): RunState {
  ensurePhase(state, "playing");
  if (!CARD_COLORS.includes(color)) {
    throw new GameRuleError("INVALID_COLOR", "유효하지 않은 색입니다.");
  }
  if (state.handHistory.length > 0) {
    throw new GameRuleError(
      "HOT_SWAP_ALREADY_LOCKED",
      "핫 스왑 색은 라운드의 첫 핸드 전에만 바꿀 수 있습니다.",
    );
  }

  const target = state.jokers.find(
    (joker) =>
      joker.jokerId === "hot-swap" &&
      (instanceId === undefined || joker.instanceId === instanceId),
  );
  if (!target) {
    throw new GameRuleError("HOT_SWAP_NOT_FOUND", "핫 스왑 조커가 없습니다.");
  }

  return addAction(
    {
      ...state,
      jokers: state.jokers.map((joker) =>
        joker.instanceId === target.instanceId
          ? { ...joker, selectedColor: color }
          : joker,
      ),
    },
    "set-hot-swap",
    { instanceId: target.instanceId, color },
  );
}

export function nextRound(state: RunState): RunState {
  ensurePhase(state, "shop");
  if (state.packOpening) {
    throw new GameRuleError(
      "PACK_CHOICE_REQUIRED",
      "열린 카드 팩에서 먼저 카드 1장을 선택해야 합니다.",
    );
  }

  let ante = state.ante;
  let round: RunState["round"];
  let unoUsedThisAnte = state.unoUsedThisAnte;
  if (state.round === "small") {
    round = "big";
  } else if (state.round === "big") {
    round = "boss";
  } else {
    ante += 1;
    round = "small";
    unoUsedThisAnte = false;
  }

  const roundNumber = state.roundNumber + 1;
  const shuffled = shuffle(persistentDeck(state), state.rngState);
  const draw = drawCards(
    shuffled.values,
    [],
    STARTING_HAND_SIZE,
    shuffled.nextState,
  );
  const defaultHotSwapColor = CARD_COLORS[(roundNumber - 1) % CARD_COLORS.length];

  return addAction(
    {
      ...state,
      rngState: draw.rngState,
      phase: "playing",
      ante,
      round,
      roundNumber,
      hand: draw.drawn,
      drawPile: draw.drawPile,
      discardPile: draw.discardPile,
      deck: persistentDeck(state),
      score: 0,
      target: targetForRound(ante, round),
      handsLeft: HANDS_PER_ROUND,
      discardsLeft: DISCARDS_PER_ROUND,
      roundIncome: 0,
      jokers: state.jokers.map((joker) => ({
        ...joker,
        ...(joker.jokerId === "combo-compiler" ? { counter: 0 } : {}),
        ...(joker.jokerId === "hot-swap"
          ? { selectedColor: defaultHotSwapColor }
          : {}),
      })),
      unoUsedThisAnte,
      handHistory: [],
      shop: null,
      packOpening: null,
      pendingReward: null,
    },
    "next-round",
    { ante, round, roundNumber },
  );
}
