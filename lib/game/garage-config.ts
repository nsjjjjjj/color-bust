import type {
  CardEnhancement,
  CardPackKind,
  DeckWorkKind,
} from "./types";

export const GARAGE_OFFER_COUNTS = {
  mods: 2,
  deckWork: 2,
  pattern: 1,
  mayhem: 1,
  packs: 1,
} as const;

export const DECK_WORK_CONFIG: Readonly<
  Record<
    DeckWorkKind,
    {
      readonly name: string;
      readonly description: string;
      readonly price: number;
      readonly symbol: string;
    }
  >
> = {
  remove: {
    name: "회로 절단",
    description: "카드 1장을 런 덱에서 제거합니다. 덱은 최소 20장을 유지합니다.",
    price: 4,
    symbol: "−",
  },
  clone: {
    name: "신호 복제",
    description: "선택한 카드와 같은 카드를 1장 추가합니다.",
    price: 5,
    symbol: "+",
  },
  recolor: {
    name: "채널 재배선",
    description: "선택한 카드의 색을 지정된 채널로 변경합니다.",
    price: 3,
    symbol: "C",
  },
  "shift-up": {
    name: "전압 상승",
    description: "선택한 카드 숫자를 +1 합니다. 9에는 사용할 수 없습니다.",
    price: 3,
    symbol: "↑",
  },
  "shift-down": {
    name: "전압 하강",
    description: "선택한 카드 숫자를 -1 합니다. 0에는 사용할 수 없습니다.",
    price: 3,
    symbol: "↓",
  },
  charge: {
    name: "POWER 셀",
    description: "선택한 카드에 득점 시 +18 POWER를 부여합니다.",
    price: 4,
    symbol: "P",
  },
  amplify: {
    name: "HYPE 앰프",
    description: "선택한 카드에 득점 시 +2 HYPE를 부여합니다.",
    price: 5,
    symbol: "H",
  },
};

export const CARD_ENHANCEMENT_CONFIG: Readonly<
  Record<
    CardEnhancement,
    {
      readonly name: string;
      readonly description: string;
      readonly power?: number;
      readonly hype?: number;
      readonly coins?: number;
    }
  >
> = {
  charged: {
    name: "충전",
    description: "득점 시 +18 POWER",
    power: 18,
  },
  amplified: {
    name: "증폭",
    description: "득점 시 +2 HYPE",
    hype: 2,
  },
  minted: {
    name: "민트",
    description: "득점 시 +1¢",
    coins: 1,
  },
};

export const CARD_PACK_CONFIG: Readonly<
  Record<
    CardPackKind,
    {
      readonly name: string;
      readonly description: string;
      readonly price: number;
      readonly symbol: string;
    }
  >
> = {
  supply: {
    name: "CIRCUIT PACK",
    description: "개조 숫자 카드 3장을 열고 1장을 런 덱에 연결합니다.",
    price: 4,
    symbol: "CP",
  },
  glitch: {
    name: "GLITCH PACK",
    description: "강한 POWER/HYPE 개조 카드 3장 중 1장을 연결합니다.",
    price: 6,
    symbol: "GP",
  },
};

// 20 cards keeps deck-thinning meaningful without making a four-hand round
// immediately run dry now that discarded cards never recycle mid-round.
export const MINIMUM_RUN_DECK_SIZE = 20;
export const RESERVE_BONUS_STEP = 5;
export const RESERVE_BONUS_CAP = 3;
export const UNUSED_HAND_BONUS_CAP = 2;
