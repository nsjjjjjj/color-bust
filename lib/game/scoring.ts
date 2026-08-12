import { effectiveHandChips, effectiveHandMultiplier, HAND_RULES } from "./constants";
import { CARD_ENHANCEMENT_CONFIG } from "./garage-config";
import { evaluateHand } from "./hands";
import { applyJokers } from "./jokers";
import { jokerSlotLimitFor } from "./run-upgrades";
import type {
  CardColor,
  CommunityUnoCard,
  GameCard,
  JokerInstance,
  PlayHandOptions,
  RunState,
  ScoreBreakdown,
} from "./types";
import { GameRuleError } from "./types";
import { applyCommunityUno } from "./uno";

export interface CalculatedHandScore {
  readonly breakdown: ScoreBreakdown;
  readonly updatedJokers: readonly JokerInstance[];
  readonly usedUnoCardId?: string;
  /** RNG cursor after probability-trigger MODs consumed their rolls. */
  readonly rngState: number;
}

function findUnoCard(state: RunState, cardId: string): CommunityUnoCard {
  const card = state.communityUno.find((candidate) => candidate.id === cardId);
  if (!card || ("kind" in card && card.kind === "hand-upgrade")) {
    throw new GameRuleError(
      "UNO_NOT_OWNED",
      "보유하고 있지 않은 커뮤니티 UNO 카드입니다.",
    );
  }
  return card as CommunityUnoCard;
}

export function calculateHandScore(
  state: RunState,
  selectedCards: readonly GameCard[],
  options: PlayHandOptions = {},
): CalculatedHandScore {
  const evaluated = evaluateHand(selectedCards);
  const scoringIds = new Set(evaluated.scoringCardIds);
  const scoringCards = selectedCards.filter((card) => scoringIds.has(card.id));
  const handRule = HAND_RULES[evaluated.type];
  const handLevel = state.handLevels[evaluated.type];
  const baseChips = effectiveHandChips(handRule, handLevel);
  const baseMultiplier = effectiveHandMultiplier(handRule, handLevel);

  const jokerResult = applyJokers({
    jokers: state.jokers,
    selectedCards,
    scoringCards,
    hand: state.hand,
    evaluatedHand: evaluated,
    handHistory: state.handHistory,
    handsLeftBeforePlay: state.handsLeft,
    discardsLeft: state.discardsLeft,
    emptyJokerSlots: Math.max(0, jokerSlotLimitFor(state) - state.jokers.length),
    rngState: state.rngState,
  });

  let cardChipBonus = 0;
  let cardMultiplierBonus = 0;
  let cardCoinGain = 0;
  const appliedCardEffects = scoringCards.flatMap((card) => {
    if (!card.enhancement) return [];
    const enhancement = CARD_ENHANCEMENT_CONFIG[card.enhancement];
    cardChipBonus += enhancement.power ?? 0;
    cardMultiplierBonus += enhancement.hype ?? 0;
    cardCoinGain += enhancement.coins ?? 0;
    return [{
      sourceId: `enhancement-${card.enhancement}`,
      sourceName: enhancement.name,
      description: enhancement.description,
      ...(enhancement.power ? { chips: enhancement.power } : {}),
      ...(enhancement.hype ? { multiplier: enhancement.hype } : {}),
      ...(enhancement.coins ? { coins: enhancement.coins } : {}),
      sourceCardId: card.id,
      sourceKind: "card" as const,
    }];
  });

  const chipsBeforeUno =
    baseChips + jokerResult.numericChips + cardChipBonus + jokerResult.jokerChipBonus;
  const multiplierBeforeUno =
    baseMultiplier + cardMultiplierBonus + jokerResult.multiplierBonus;
  const scoreBeforeUno = Math.floor(
    chipsBeforeUno * multiplierBeforeUno * jokerResult.xMultiplier,
  );

  let uno;
  let total = scoreBeforeUno;
  let usedUnoCardId: string | undefined;

  if (options.unoCardId) {
    if (!options.calledColor) {
      throw new GameRuleError(
        "UNO_COLOR_REQUIRED",
        "UNO 카드를 사용할 때 호출할 색을 선택해야 합니다.",
      );
    }

    const card = findUnoCard(state, options.unoCardId);
    uno = applyCommunityUno({
      card,
      calledColor: options.calledColor as CardColor,
      scoringCards,
      chipsBeforeUno,
      multiplierBeforeUno,
      jokerXMultiplier: jokerResult.xMultiplier,
      scoreBeforeUno,
      handsLeftBeforePlay: state.handsLeft,
    });
    total = uno.scoreAfterUno;
    usedUnoCardId = card.id;
  } else if (options.calledColor) {
    throw new GameRuleError(
      "UNO_CARD_REQUIRED",
      "호출 색을 사용하려면 UNO 카드도 선택해야 합니다.",
    );
  }

  return {
    breakdown: {
      handType: evaluated.type,
      handName: handRule.name,
      handLevel,
      selectedCardIds: evaluated.selectedCardIds,
      scoringCardIds: evaluated.scoringCardIds,
      baseChips,
      numericChips: jokerResult.numericChips,
      jokerChipBonus: jokerResult.jokerChipBonus,
      baseMultiplier,
      jokerMultiplierBonus: jokerResult.multiplierBonus,
      jokerXMultiplier: jokerResult.xMultiplier,
      chipsBeforeUno,
      multiplierBeforeUno,
      scoreBeforeUno,
      uno,
      total,
      coinGain: jokerResult.coinGain + cardCoinGain,
      roundReward: 0,
      appliedJokers: jokerResult.appliedEffects,
      appliedCardEffects,
    },
    updatedJokers: jokerResult.updatedJokers,
    usedUnoCardId,
    rngState: jokerResult.rngState,
  };
}
