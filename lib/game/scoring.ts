import { HAND_RULES } from "./constants";
import { evaluateHand } from "./hands";
import { applyJokers } from "./jokers";
import type {
  CardColor,
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
}

function findUnoCard(state: RunState, cardId: string) {
  const card = state.communityUno.find((candidate) => candidate.id === cardId);
  if (!card) {
    throw new GameRuleError(
      "UNO_NOT_OWNED",
      "보유하고 있지 않은 커뮤니티 UNO 카드입니다.",
    );
  }
  return card;
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
  const baseChips =
    handRule.baseChips + handRule.chipsPerLevel * Math.max(0, handLevel - 1);
  const baseMultiplier =
    handRule.baseMultiplier +
    handRule.multiplierPerLevel * Math.max(0, handLevel - 1);

  const jokerResult = applyJokers({
    jokers: state.jokers,
    selectedCards,
    scoringCards,
    evaluatedHand: evaluated,
    handHistory: state.handHistory,
    handsLeftBeforePlay: state.handsLeft,
    discardsLeft: state.discardsLeft,
  });

  const chipsBeforeUno =
    baseChips + jokerResult.numericChips + jokerResult.jokerChipBonus;
  const multiplierBeforeUno = baseMultiplier + jokerResult.multiplierBonus;
  const scoreBeforeUno = Math.floor(
    chipsBeforeUno * multiplierBeforeUno * jokerResult.xMultiplier,
  );

  let uno;
  let total = scoreBeforeUno;
  let usedUnoCardId: string | undefined;

  if (options.unoCardId) {
    if (state.unoUsedThisAnte) {
      throw new GameRuleError(
        "UNO_ALREADY_USED",
        "커뮤니티 UNO 카드는 앤티마다 한 번만 사용할 수 있습니다.",
      );
    }
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
      coinGain: jokerResult.coinGain,
      roundReward: 0,
      appliedJokers: jokerResult.appliedEffects,
    },
    updatedJokers: jokerResult.updatedJokers,
    usedUnoCardId,
  };
}
