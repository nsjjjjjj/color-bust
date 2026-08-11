// Stable public API for the UI, persistence layer, and server-side replay.
export * from "./types";
export * from "./constants";
export * from "./garage-config";

export {
  createRun,
  playHand,
  previewHand,
  discardCards,
  claimRoundReward,
  buyJoker,
  buyUnoCard,
  buyHandUpgrade,
  buyDeckWork,
  buyCardPack,
  choosePackCard,
  buyShopOffer,
  sellJoker,
  rerollShop,
  setHotSwapColor,
  nextRound,
} from "./engine";

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
