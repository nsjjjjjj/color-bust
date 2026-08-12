import type {
  CardEnhancement,
  CardPackKind,
  DeckWorkKind,
  FirmwareId,
  GhostId,
  ProtocolId,
} from "./types";

export const GARAGE_OFFER_COUNTS = {
  signal: 2,
  deckLab: 1,
  /** @deprecated New shops mix MODs into the two signal slots. */
  mods: 2,
  /** @deprecated Card surgery moved to PROTOCOL cards. */
  deckWork: 1,
  /** @deprecated CORE cards are mixed into the signal slots. */
  pattern: 1,
  /** @deprecated MAYHEM is now a rare signal result. */
  mayhem: 1,
  packs: 2,
} as const;

export const TODAY_SIGNAL_WEIGHTS = {
  mod: 45,
  core: 30,
  protocol: 20,
  mayhem: 5,
} as const;

type UtilityCardConfig = {
  readonly name: string;
  readonly description: string;
  readonly price: number;
  readonly symbol: string;
};

export const PROTOCOL_CONFIG: Readonly<Record<ProtocolId, UtilityCardConfig>> = {
  "circuit-cut": {
    name: "회로 절단",
    description: "선택한 숫자 카드 1장을 런 덱에서 안전하게 제거합니다.",
    price: 4,
    symbol: "−",
  },
  "signal-clone": {
    name: "신호 복제",
    description: "선택한 숫자 카드와 같은 카드 1장을 런 덱에 추가합니다.",
    price: 5,
    symbol: "+",
  },
  "channel-rewire": {
    name: "채널 재배선",
    description: "선택한 숫자 카드 최대 3장의 색을 지정 채널로 변경합니다.",
    price: 4,
    symbol: "C",
  },
  "voltage-up": {
    name: "전압 상승",
    description: "선택한 숫자 카드 1장의 숫자를 +1 합니다.",
    price: 3,
    symbol: "↑",
  },
  "voltage-down": {
    name: "전압 하강",
    description: "선택한 숫자 카드 1장의 숫자를 -1 합니다.",
    price: 3,
    symbol: "↓",
  },
  "power-cell": {
    name: "POWER 셀",
    description: "선택한 기본 카드 1장에 충전 효과를 부여합니다.",
    price: 4,
    symbol: "P",
  },
  "hype-amp": {
    name: "HYPE 앰프",
    description: "선택한 기본 카드 1장에 증폭 효과를 부여합니다.",
    price: 5,
    symbol: "H",
  },
  "emergency-credit": {
    name: "긴급 송금",
    description: "즉시 4¢를 획득합니다.",
    price: 3,
    symbol: "¢",
  },
};

export const GHOST_CONFIG: Readonly<Record<GhostId, UtilityCardConfig>> = {
  "wild-signal": {
    name: "와일드 시그널",
    description: "핸드에서 선택한 기본 카드 1장에 무작위 강화를 부여합니다.",
    price: 7,
    symbol: "?",
  },
  "chaos-cache": {
    name: "카오스 캐시",
    description: "핸드에서 무작위 카드 1장을 버리고, 무작위 강화 숫자 카드 3장을 핸드에 추가합니다.",
    price: 0,
    symbol: "4+",
  },
  "bankrupt-bargain": {
    name: "파산 거래",
    description: "무작위 레어 등급 MOD 1장을 생성하고 보유 코인을 0¢로 만듭니다.",
    price: 0,
    symbol: "¢0",
  },
  "spectrum-wash": {
    name: "스펙트럼 워시",
    description: "핸드의 모든 카드를 무작위로 선택된 같은 색으로 전환합니다.",
    price: 0,
    symbol: "◈",
  },
  "universal-core": {
    name: "유니버설 코어",
    description: "모든 족보 레벨을 1씩 올립니다.",
    price: 0,
    symbol: "LV+",
  },
};

type FirmwareConfig = UtilityCardConfig & {
  readonly maxStacks: number;
};

export const FIRMWARE_CONFIG: Readonly<Record<FirmwareId, FirmwareConfig>> = {
  "expanded-mod-bay": {
    name: "MOD 슬롯 확장",
    description: "MOD 최대 보유량 +1",
    price: 10,
    symbol: "M+",
    maxStacks: 1,
  },
  "hand-memory": {
    name: "핸드 메모리",
    description: "다음 라운드부터 손패 크기 +1",
    price: 9,
    symbol: "H+",
    maxStacks: 2,
  },
  "recycle-unit": {
    name: "재활용 장치",
    description: "다음 라운드부터 버리기 +1",
    price: 8,
    symbol: "D+",
    maxStacks: 2,
  },
  "backup-power": {
    name: "예비 전원",
    description: "다음 라운드부터 핸드 +1",
    price: 10,
    symbol: "P+",
    maxStacks: 2,
  },
  "wholesale-link": {
    name: "도매 연결",
    description: "이후 생성되는 모든 팩 가격 -1¢",
    price: 8,
    symbol: "$−",
    maxStacks: 2,
  },
  "reroll-cache": {
    name: "리롤 캐시",
    description: "상점 리롤 기본 비용 -1¢",
    price: 8,
    symbol: "R−",
    maxStacks: 1,
  },
  "signal-scanner": {
    name: "신호 스캐너",
    description: "이후 여는 팩의 공개 선택지 +1",
    price: 9,
    symbol: "S+",
    maxStacks: 2,
  },
  "reward-amplifier": {
    name: "보상 증폭기",
    description: "라운드 클리어 기본 보상 +1¢",
    price: 7,
    symbol: "¢+",
    maxStacks: 3,
  },
};

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
  overclocked: {
    name: "오버클럭",
    description: "득점 시 +30 POWER, +3 HYPE",
    power: 30,
    hype: 3,
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
  standard: {
    name: "STANDARD PACK",
    description: "숫자 카드 3장을 공개하고 1장을 선택합니다.",
    price: 4,
    symbol: "ST",
  },
  large: {
    name: "LARGE PACK",
    description: "숫자 카드 5장을 공개하고 2장을 선택합니다.",
    price: 7,
    symbol: "LG",
  },
  premium: {
    name: "PREMIUM PACK",
    description: "희귀 개조 카드 5장을 공개하고 2장을 선택합니다.",
    price: 9,
    symbol: "PR",
  },
  modifier: {
    name: "MODIFIER PACK",
    description: "MOD 3개를 공개하고 1개를 장착합니다.",
    price: 7,
    symbol: "MD",
  },
  upgrade: {
    name: "UPGRADE PACK",
    description: "강화 효과 3개 중 1개를 골라 덱 카드에 부여합니다.",
    price: 6,
    symbol: "UP",
  },
  core: {
    name: "CORE PACK",
    description: "족보 CORE 3개를 공개하고 1개를 선택합니다.",
    price: 6,
    symbol: "CR",
  },
  protocol: {
    name: "PROTOCOL PACK",
    description: "안전한 일회용 PROTOCOL 3개를 공개하고 1개를 선택합니다.",
    price: 5,
    symbol: "PT",
  },
  ghost: {
    name: "GHOST PACK",
    description: "강력한 대가를 가진 GHOST 2개를 공개하고 1개를 선택합니다.",
    price: 7,
    symbol: "GH",
  },
  supply: {
    name: "STANDARD PACK",
    description: "숫자 카드 3장을 공개하고 1장을 선택합니다.",
    price: 4,
    symbol: "ST",
  },
  glitch: {
    name: "PREMIUM PACK",
    description: "희귀 개조 카드 5장을 공개하고 2장을 선택합니다.",
    price: 9,
    symbol: "PR",
  },
};

// 20 cards keeps deck-thinning meaningful without making a four-hand round
// immediately run dry now that discarded cards never recycle mid-round.
export const MINIMUM_RUN_DECK_SIZE = 20;
export const RESERVE_BONUS_STEP = 5;
export const RESERVE_BONUS_CAP = 3;
export const UNUSED_HAND_BONUS_CAP = 2;
