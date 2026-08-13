// Stable public API for the UI, persistence layer, and server-side replay.
export * from "./types";
export * from "./constants";
export * from "./garage-config";
export { BOSS_PENALTIES, bossPenaltyFor } from "./boss-penalties";

export {
  createRun,
  playHand,
  previewHand,
  discardCards,
  claimRoundReward,
  continueEndlessRun,
  buyJoker,
  buyUnoCard,
  buyHandUpgrade,
  buyProtocol,
  buyFirmware,
  buyDeckWork,
  buyCardPack,
  choosePackCard,
  takePackChoices,
  skipPackOpening,
  buyShopOffer,
  sellJoker,
  useStashedHandUpgrade,
  useStashedGhostItem,
  useStashedItem,
  sellStashedItem,
  rerollShop,
  useConsumable,
  setHotSwapColor,
  nextRound,
} from "./engine";

export {
  runFirmware,
  firmwareCount,
  jokerSlotLimitFor,
} from "./run-upgrades";

export { PACK_DEFINITIONS, PackGenerator, RARITY_ORDER } from "./packs";

export { createNumberDeck, drawCards, shuffledDeck } from "./deck";
export {
  evaluateHand,
  isStraight,
  isFlush,
  isStraightType,
  isFlushType,
} from "./hands";
export { calculateHandScore } from "./scoring";
export { applyJokers } from "./jokers";
export {
  applyCommunityUno,
  validateCommunityUnoCard,
  assertValidCommunityUnoCard,
  describeUnoModule,
  isKnownUnoModule,
  UNO_BASE_DESCRIPTION,
  UNO_BUILDER_RULE,
} from "./uno";
export { hashSeed, nextRandom, randomInt, shuffle } from "./rng";
