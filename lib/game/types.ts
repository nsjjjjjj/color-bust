export const COLORS = ["red", "blue", "green", "yellow"] as const;

export type CardColor = (typeof COLORS)[number];
export type CardRank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface GameCard {
  readonly id: string;
  readonly color: CardColor;
  readonly rank: CardRank;
  /** Optional in-run tuning applied by Garage work or card packs. */
  readonly enhancement?: CardEnhancement;
}

export type CardEnhancement = "charged" | "amplified" | "minted";

export const HAND_TYPES = [
  "high-card",
  "pair",
  "two-pair",
  "three-of-a-kind",
  "straight",
  "flush",
  "full-house",
  "four-of-a-kind",
  "straight-flush",
] as const;

export type HandType = (typeof HAND_TYPES)[number];
export type RunMode = "standard" | "endless";
export type RunPhase = "playing" | "reward" | "shop" | "won" | "lost";
export type RoundType = "small" | "big" | "boss";
export type JokerRarity = "common" | "uncommon" | "rare";

export interface HandRule {
  readonly type: HandType;
  readonly name: string;
  readonly baseChips: number;
  readonly baseMultiplier: number;
  readonly chipsPerLevel: number;
  readonly multiplierPerLevel: number;
}

export interface EvaluatedHand {
  readonly type: HandType;
  readonly selectedCardIds: readonly string[];
  readonly scoringCardIds: readonly string[];
}

export type JokerId =
  | "zero-day"
  | "redline"
  | "blue-buffer"
  | "green-loop"
  | "yellow-ticket"
  | "odd-signal"
  | "even-signal"
  | "cache-hit"
  | "splash-mode"
  | "spectrum-analyzer"
  | "monochrome-monitor"
  | "sequence-accelerator"
  | "full-stack"
  | "spare-battery"
  | "last-commit"
  | "version-control"
  | "cmyk-core"
  | "combo-compiler"
  | "hot-swap"
  | "null-pointer";

export interface JokerDefinition {
  readonly id: JokerId;
  readonly name: string;
  readonly description: string;
  readonly rarity: JokerRarity;
  readonly price: number;
}

export interface JokerInstance {
  readonly instanceId: string;
  readonly jokerId: JokerId;
  readonly acquiredRound: number;
  readonly selectedColor?: CardColor;
  readonly counter?: number;
}

export type UnoPositiveModuleId =
  | "color-burst"
  | "number-echo"
  | "steady-mult"
  | "low-frequency"
  | "double-call"
  | "spectrum-drive"
  | "precision-boost"
  | "last-signal";

export type UnoNegativeModuleId =
  | "off-color-tax"
  | "signal-loss"
  | "mult-drain"
  | "narrow-band"
  | "glass-output"
  | "single-channel"
  | "weak-start"
  | "hard-cap";

export type UnoModuleId = UnoPositiveModuleId | UnoNegativeModuleId;
export type UnoModuleKind = "positive" | "negative";

export interface UnoModuleDefinition {
  readonly id: UnoModuleId;
  readonly name: string;
  readonly description: string;
  readonly kind: UnoModuleKind;
  /** Positive modules use +1/+2, negative modules use -1/-2. */
  readonly points: -2 | -1 | 1 | 2;
}

export interface CommunityUnoCard {
  readonly id: string;
  readonly name: string;
  readonly author: string;
  readonly version: number;
  readonly positiveModules: readonly UnoPositiveModuleId[];
  readonly negativeModules: readonly UnoNegativeModuleId[];
}

export interface UnoValidationResult {
  readonly valid: boolean;
  readonly pointTotal: number;
  readonly errors: readonly string[];
}

export interface AppliedEffect {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly description: string;
  readonly chips?: number;
  readonly multiplier?: number;
  readonly xMultiplier?: number;
  readonly coins?: number;
  /** Lets the presentation resolve a card and its MOD triggers as one beat. */
  readonly sourceCardId?: string;
  readonly sourceKind?: "card" | "mod" | "mayhem";
}

export interface UnoScoreBreakdown {
  readonly cardId: string;
  readonly cardName: string;
  readonly calledColor: CardColor;
  readonly colorCallChips: number;
  readonly chipDelta: number;
  readonly multiplierDelta: number;
  readonly xMultiplier: number;
  readonly capMultiplier: number;
  readonly scoreBeforeUno: number;
  readonly uncappedScore: number;
  readonly scoreAfterUno: number;
  readonly appliedEffects: readonly AppliedEffect[];
}

export interface ScoreBreakdown {
  readonly handType: HandType;
  readonly handName: string;
  readonly handLevel: number;
  readonly selectedCardIds: readonly string[];
  readonly scoringCardIds: readonly string[];
  readonly baseChips: number;
  readonly numericChips: number;
  readonly jokerChipBonus: number;
  readonly baseMultiplier: number;
  readonly jokerMultiplierBonus: number;
  readonly jokerXMultiplier: number;
  readonly chipsBeforeUno: number;
  readonly multiplierBeforeUno: number;
  readonly scoreBeforeUno: number;
  readonly uno?: UnoScoreBreakdown;
  readonly total: number;
  readonly coinGain: number;
  readonly roundReward: number;
  readonly appliedJokers: readonly AppliedEffect[];
  readonly appliedCardEffects?: readonly AppliedEffect[];
}

export interface JokerShopOffer {
  readonly id: string;
  readonly kind: "joker";
  readonly price: number;
  readonly jokerId: JokerId;
}

export interface HandUpgradeShopOffer {
  readonly id: string;
  readonly kind: "hand-upgrade";
  readonly price: number;
  readonly handType: HandType;
}

export interface UnoShopOffer {
  readonly id: string;
  readonly kind: "community-uno";
  readonly price: number;
  readonly card: CommunityUnoCard;
}

export type DeckWorkKind =
  | "remove"
  | "clone"
  | "recolor"
  | "shift-up"
  | "shift-down"
  | "charge"
  | "amplify";

export interface DeckWorkShopOffer {
  readonly id: string;
  readonly kind: "deck-work";
  readonly price: number;
  readonly work: DeckWorkKind;
  readonly targetColor?: CardColor;
}

export type CardPackKind = "supply" | "glitch";

export interface CardPackShopOffer {
  readonly id: string;
  readonly kind: "card-pack";
  readonly price: number;
  readonly packKind: CardPackKind;
}

export type ShopOffer =
  | JokerShopOffer
  | HandUpgradeShopOffer
  | UnoShopOffer
  | DeckWorkShopOffer
  | CardPackShopOffer;

export interface ShopState {
  readonly id: string;
  readonly offers: readonly ShopOffer[];
  readonly rerollCost: number;
  readonly rerolls: number;
}

export interface PackOpening {
  readonly offerId: string;
  readonly packKind: CardPackKind;
  readonly choices: readonly GameCard[];
}

export interface RoundReward {
  readonly baseCoins: number;
  readonly handBonus: number;
  readonly reserveBonus: number;
  readonly modIncome: number;
  readonly total: number;
  readonly nextPhase: "shop" | "won";
}

export interface RunStats {
  readonly handsPlayed: number;
  readonly cardsDiscarded: number;
  readonly roundsCleared: number;
  readonly highestHandScore: number;
  readonly totalScore: number;
  readonly unoUses: number;
}

export type RunActionType =
  | "play-hand"
  | "discard"
  | "buy-joker"
  | "buy-uno"
  | "buy-deck-work"
  | "buy-card-pack"
  | "choose-pack-card"
  | "upgrade-hand"
  | "sell-joker"
  | "reroll-shop"
  | "claim-reward"
  | "set-hot-swap"
  | "next-round";

export interface RunActionRecord {
  readonly sequence: number;
  readonly type: RunActionType;
  readonly payload: Readonly<Record<string, string | number | boolean | readonly string[]>>;
}

export interface RunState {
  readonly version: 1;
  readonly runId: string;
  readonly seed: string;
  readonly rngState: number;
  readonly phase: RunPhase;
  readonly mode: RunMode;
  readonly ante: number;
  readonly round: RoundType;
  /** One-based number across the whole run. */
  readonly roundNumber: number;
  readonly hand: readonly GameCard[];
  readonly drawPile: readonly GameCard[];
  readonly discardPile: readonly GameCard[];
  /** Persistent run deck. Old v1 saves omit it and are normalized from zones. */
  readonly deck?: readonly GameCard[];
  readonly score: number;
  readonly target: number;
  readonly handsLeft: number;
  readonly discardsLeft: number;
  readonly coins: number;
  /** Economy effects earned during this round and paid on reward claim. */
  readonly roundIncome?: number;
  readonly jokers: readonly JokerInstance[];
  readonly communityUno: readonly CommunityUnoCard[];
  readonly communityUnoPool: readonly CommunityUnoCard[];
  readonly unoUsedThisAnte: boolean;
  readonly handLevels: Readonly<Record<HandType, number>>;
  readonly handHistory: readonly HandType[];
  readonly shop: ShopState | null;
  readonly packOpening?: PackOpening | null;
  readonly pendingReward?: RoundReward | null;
  readonly stats: RunStats;
  readonly actionLog: readonly RunActionRecord[];
}

export interface CreateRunOptions {
  readonly seed?: string | number;
  readonly mode?: RunMode;
  readonly startingCoins?: number;
  readonly communityUnoPool?: readonly CommunityUnoCard[];
  readonly starterUno?: CommunityUnoCard;
}

export interface PlayHandOptions {
  readonly unoCardId?: string;
  readonly calledColor?: CardColor;
}

export interface PlayHandResult {
  readonly state: RunState;
  readonly breakdown: ScoreBreakdown;
  readonly roundCleared: boolean;
  readonly runEnded: boolean;
}

export class GameRuleError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GameRuleError";
    this.code = code;
  }
}
