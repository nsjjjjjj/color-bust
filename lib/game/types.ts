export const COLORS = ["red", "blue", "green", "yellow"] as const;

export type CardColor = (typeof COLORS)[number];
export type CardRank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface GameCard {
  readonly id: string;
  readonly color: CardColor;
  readonly rank: CardRank;
  /** Optional in-run tuning applied by Garage work or card packs. */
  readonly enhancement?: CardEnhancement;
  /** Pack provenance only; normal deck cards may omit it. */
  readonly rarity?: CardRarity;
}

export type CardEnhancement = "charged" | "amplified" | "minted" | "overclocked";
export type CardRarity = "common" | "uncommon" | "rare" | "legendary";

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
export type BossPenaltyId =
  | "channel-jam"
  | "hand-drain"
  | "signal-surge"
  | "hard-lock"
  | "final-gate"
  | "color-jam"
  | "flint-cut"
  | "pattern-lock"
  | "mono-track"
  | "one-shot"
  | "narrow-hand"
  | "forced-purge";
export type JokerRarity = "common" | "uncommon" | "rare";

export interface HandRule {
  readonly type: HandType;
  readonly name: string;
  readonly baseChips: number;
  readonly baseMultiplier: number;
  /** Flat POWER/HYPE added by each CORE level above level 1. */
  readonly chipGrowthPerLevel: number;
  readonly multGrowthPerLevel: number;
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
  | "null-pointer"
  | "venom-drip"
  | "volt-surge"
  | "half-compile"
  | "ice-cream-cache"
  | "memory-buffer"
  | "mystic-summit"
  | "delayed-gratification"
  | "fibonacci-routine"
  | "loyalty-session"
  | "jolly-routine"
  | "zany-core"
  | "mad-routine"
  | "runner-process"
  | "green-demon"
  | "eight-ball-exploit"
  | "bloodstone-driver"
  | "reserved-slot"
  | "turtle-bean-cache"
  | "spare-trousers"
  | "blueprint-protocol"
  | "cavendish-overclock"
  | "perkeos-echo"
  | "stencil-core";

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
  | "boot-delay"
  | "glass-output"
  | "memory-pressure"
  | "battery-drain"
  | "lockup-process";

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

export interface HandUpgradeItem {
  readonly id: string;
  readonly kind: "hand-upgrade";
  readonly handType: HandType;
  readonly name: string;
  readonly price: number;
}

export interface GhostItem {
  readonly id: string;
  readonly kind: "ghost";
  readonly ghostId: GhostId;
  readonly name: string;
  readonly price: number;
}

export type StashedMayhemItem = CommunityUnoCard | HandUpgradeItem | GhostItem;

export interface UnoValidationResult {
  readonly valid: boolean;
  readonly pointTotal: number;
  readonly errors: readonly string[];
}

export type ProtocolId =
  | "circuit-cut"
  | "signal-clone"
  | "channel-rewire"
  | "voltage-up"
  | "voltage-down"
  | "power-cell"
  | "hype-amp"
  | "emergency-credit";

export type GhostId = "wild-signal" | "chaos-cache" | "bankrupt-bargain" | "spectrum-wash" | "universal-core";

export type FirmwareId =
  | "expanded-mod-bay"
  | "hand-memory"
  | "recycle-unit"
  | "backup-power"
  | "wholesale-link"
  | "reroll-cache"
  | "signal-scanner"
  | "reward-amplifier";

export interface ProtocolConsumable {
  readonly instanceId: string;
  readonly kind: "protocol";
  readonly protocolId: ProtocolId;
  readonly acquiredRound: number;
}

export interface GhostConsumable {
  readonly instanceId: string;
  readonly kind: "ghost";
  readonly ghostId: GhostId;
  readonly acquiredRound: number;
}

export type ConsumableInstance = ProtocolConsumable | GhostConsumable;

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

export interface ProtocolShopOffer {
  readonly id: string;
  readonly kind: "protocol";
  readonly price: number;
  readonly protocolId: ProtocolId;
}

export interface FirmwareShopOffer {
  readonly id: string;
  readonly kind: "firmware";
  readonly price: number;
  readonly firmwareId: FirmwareId;
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

export type CardPackKind =
  | "standard"
  | "large"
  | "premium"
  | "modifier"
  | "upgrade"
  | "core"
  | "protocol"
  | "ghost"
  /** Legacy save aliases. New shops never generate these values. */
  | "supply"
  | "glitch";

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
  | ProtocolShopOffer
  | FirmwareShopOffer
  | DeckWorkShopOffer
  | CardPackShopOffer;

export interface ShopState {
  readonly id: string;
  readonly offers: readonly ShopOffer[];
  /** IDs for the two rerollable Today's Signal slots. Legacy saves omit this. */
  readonly signalOfferIds?: readonly string[];
  /** The fixed Deck Lab slot. New shops use a firmware offer here. */
  readonly deckLabOfferId?: string;
  /** The two fixed Pack Bay slots. */
  readonly packOfferIds?: readonly string[];
  /** Guaranteed first-shop MAYHEM offers stay through signal rerolls until bought. */
  readonly lockedSignalOfferIds?: readonly string[];
  /** Purchased slots stay visible until the player rerolls or leaves. */
  readonly soldOfferIds?: readonly string[];
  readonly rerollCost: number;
  readonly rerolls: number;
}

export interface CardPackChoice {
  readonly id: string;
  readonly kind: "card";
  readonly rarity: CardRarity;
  readonly card: GameCard;
}

export interface ModifierPackChoice {
  readonly id: string;
  readonly kind: "modifier";
  readonly rarity: CardRarity;
  readonly jokerId: JokerId;
}

export interface UpgradePackChoice {
  readonly id: string;
  readonly kind: "upgrade";
  readonly rarity: CardRarity;
  readonly enhancement: CardEnhancement;
}

export interface CorePackChoice {
  readonly id: string;
  readonly kind: "core";
  readonly rarity: CardRarity;
  readonly handType: HandType;
}

export interface ProtocolPackChoice {
  readonly id: string;
  readonly kind: "protocol";
  readonly rarity: CardRarity;
  readonly protocolId: ProtocolId;
}

export interface GhostPackChoice {
  readonly id: string;
  readonly kind: "ghost";
  readonly rarity: CardRarity;
  readonly ghostId: GhostId;
}

export type PackChoice =
  | CardPackChoice
  | ModifierPackChoice
  | UpgradePackChoice
  | CorePackChoice
  | ProtocolPackChoice
  | GhostPackChoice;

export interface PackOpening {
  readonly offerId: string;
  readonly packKind: CardPackKind;
  readonly choices: readonly PackChoice[];
  readonly pickCount: number;
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
  | "buy-protocol"
  | "buy-firmware"
  | "use-consumable"
  | "use-hand-upgrade"
  | "sell-stashed-item"
  | "choose-pack-card"
  | "take-pack-choices"
  | "skip-pack-opening"
  | "upgrade-hand"
  | "sell-joker"
  | "reroll-shop"
  | "claim-reward"
  | "continue-endless"
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
  readonly communityUno: readonly StashedMayhemItem[];
  readonly communityUnoPool: readonly CommunityUnoCard[];
  /** Shared two-slot inventory for PROTOCOL and GHOST cards. */
  readonly consumables?: readonly ConsumableInstance[];
  /** Run-wide Deck Lab upgrades. Duplicates represent stackable firmware. */
  readonly firmware?: readonly FirmwareId[];
  /** Optional penalties are omitted by legacy v1 saves. */
  readonly nextRoundHandPenalty?: number;
  readonly permanentDiscardPenalty?: number;
  /** The boss effect rolled for the current/most recent boss round. Legacy saves omit it. */
  readonly bossPenaltyId?: BossPenaltyId | null;
  /** The CardColor jammed by a "color-jam" boss effect, rolled alongside bossPenaltyId. */
  readonly bossDebuffColor?: CardColor | null;
  /** The HandType a "mono-track" boss effect locked in from this round's first play. */
  readonly bossLockedHandType?: HandType | null;
  readonly unoUsedThisAnte: boolean;
  readonly handLevels: Readonly<Record<HandType, number>>;
  readonly handHistory: readonly HandType[];
  readonly shop: ShopState | null;
  readonly packOpening?: PackOpening | null;
  readonly pendingReward?: RoundReward | null;
  readonly stats: RunStats;
  /** Total actions taken this run, ever-incrementing. Legacy saves omit it. */
  readonly actionSequence?: number;
  /** Recent action history only, capped in length; see addAction in engine.ts. */
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
  /** Second Color Call selection; only consumed when the played card has the double-call module. */
  readonly calledColorTwo?: CardColor;
}

export interface UseConsumableOptions {
  readonly targetCardIds?: readonly string[];
  readonly targetColor?: CardColor;
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
