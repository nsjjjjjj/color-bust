import type {
  CardColor,
  CommunityUnoCard,
  HandRule,
  HandType,
  JokerDefinition,
  JokerId,
  RoundType,
  UnoModuleDefinition,
  UnoModuleId,
} from "./types";

export const STARTING_HAND_SIZE = 8;
export const MAX_PLAY_CARDS = 5;
export const HANDS_PER_ROUND = 4;
export const DISCARDS_PER_ROUND = 2;
export const JOKER_SLOT_LIMIT = 4;
export const UNO_SLOT_LIMIT = 3;
export const UNO_SCORE_CAP = 1.6;
export const SHOP_JOKER_OFFERS = 3;
export const SHOP_HAND_UPGRADE_OFFERS = 1;
export const SHOP_UNO_OFFERS = 1;

export const ROUND_ORDER: readonly RoundType[] = ["small", "big", "boss"];

export const ROUND_REWARDS: Readonly<Record<RoundType, number>> = {
  small: 4,
  big: 5,
  boss: 7,
};

export const CARD_COLORS: readonly CardColor[] = [
  "red",
  "blue",
  "green",
  "yellow",
];

export const HAND_RULES: Readonly<Record<HandType, HandRule>> = {
  "high-card": {
    type: "high-card",
    name: "하이 카드",
    baseChips: 5,
    baseMultiplier: 1,
    chipsPerLevel: 10,
    multiplierPerLevel: 1,
  },
  pair: {
    type: "pair",
    name: "페어",
    baseChips: 10,
    baseMultiplier: 2,
    chipsPerLevel: 10,
    multiplierPerLevel: 1,
  },
  "two-pair": {
    type: "two-pair",
    name: "투 페어",
    baseChips: 25,
    baseMultiplier: 3,
    chipsPerLevel: 15,
    multiplierPerLevel: 1,
  },
  "three-of-a-kind": {
    type: "three-of-a-kind",
    name: "트리플",
    baseChips: 35,
    baseMultiplier: 3,
    chipsPerLevel: 20,
    multiplierPerLevel: 2,
  },
  straight: {
    type: "straight",
    name: "스트레이트",
    baseChips: 45,
    baseMultiplier: 4,
    chipsPerLevel: 25,
    multiplierPerLevel: 2,
  },
  flush: {
    type: "flush",
    name: "플러시",
    baseChips: 50,
    baseMultiplier: 4,
    chipsPerLevel: 25,
    multiplierPerLevel: 2,
  },
  "full-house": {
    type: "full-house",
    name: "풀 하우스",
    baseChips: 55,
    baseMultiplier: 4,
    chipsPerLevel: 30,
    multiplierPerLevel: 2,
  },
  "four-of-a-kind": {
    type: "four-of-a-kind",
    name: "포 카드",
    baseChips: 110,
    baseMultiplier: 9,
    chipsPerLevel: 45,
    multiplierPerLevel: 4,
  },
  "straight-flush": {
    type: "straight-flush",
    name: "스트레이트 플러시",
    baseChips: 160,
    baseMultiplier: 12,
    chipsPerLevel: 55,
    multiplierPerLevel: 5,
  },
};

/** Ante 1-5 targets. Endless mode scales the fifth row for later Antes. */
export const ROUND_TARGETS: Readonly<
  Record<number, Readonly<Record<RoundType, number>>>
> = {
  1: { small: 500, big: 650, boss: 825 },
  2: { small: 950, big: 1200, boss: 1550 },
  3: { small: 1725, big: 2250, boss: 2925 },
  4: { small: 3250, big: 4225, boss: 5550 },
  5: { small: 6150, big: 8025, boss: 10550 },
};

export const JOKER_CATALOG: Readonly<Record<JokerId, JokerDefinition>> = {
  "zero-day": {
    id: "zero-day",
    name: "제로 데이",
    description: "득점 카드에 0이 있으면 +4 HYPE",
    rarity: "common",
    price: 4,
  },
  redline: {
    id: "redline",
    name: "레드라인",
    description: "득점한 RAGE 카드마다 +12 POWER (최대 +60)",
    rarity: "common",
    price: 4,
  },
  "blue-buffer": {
    id: "blue-buffer",
    name: "블루 버퍼",
    description: "GLITCH 카드가 2장 이상 득점하면 +45 POWER",
    rarity: "common",
    price: 4,
  },
  "green-loop": {
    id: "green-loop",
    name: "그린 루프",
    description: "같은 숫자가 2장 이상 득점하면 +40 POWER",
    rarity: "common",
    price: 4,
  },
  "yellow-ticket": {
    id: "yellow-ticket",
    name: "옐로 티켓",
    description: "라운드 첫 핸드에 VOLT 득점 카드가 있으면 2코인 획득",
    rarity: "common",
    price: 4,
  },
  "odd-signal": {
    id: "odd-signal",
    name: "홀수 신호",
    description: "득점한 홀수 카드마다 +8 POWER (최대 +40)",
    rarity: "common",
    price: 4,
  },
  "even-signal": {
    id: "even-signal",
    name: "짝수 신호",
    description: "득점한 짝수 카드마다 +8 POWER (최대 +40, 0 포함)",
    rarity: "common",
    price: 4,
  },
  "cache-hit": {
    id: "cache-hit",
    name: "캐시 히트",
    description: "이번 라운드에 이미 사용한 족보라면 +4 HYPE",
    rarity: "common",
    price: 4,
  },
  "splash-mode": {
    id: "splash-mode",
    name: "스플래시 모드",
    description: "제출한 모든 카드의 숫자 POWER를 계산",
    rarity: "uncommon",
    price: 6,
  },
  "spectrum-analyzer": {
    id: "spectrum-analyzer",
    name: "스펙트럼 분석기",
    description: "득점 카드에 4색이 모두 있으면 +50 POWER, +5 HYPE",
    rarity: "uncommon",
    price: 6,
  },
  "monochrome-monitor": {
    id: "monochrome-monitor",
    name: "단색 모니터",
    description: "플러시 계열 족보에 +60 POWER, +5 HYPE",
    rarity: "uncommon",
    price: 6,
  },
  "sequence-accelerator": {
    id: "sequence-accelerator",
    name: "시퀀스 가속기",
    description: "스트레이트 계열 족보에 +7 HYPE",
    rarity: "uncommon",
    price: 6,
  },
  "full-stack": {
    id: "full-stack",
    name: "풀 스택",
    description: "풀 하우스에 +120 POWER",
    rarity: "uncommon",
    price: 6,
  },
  "spare-battery": {
    id: "spare-battery",
    name: "예비 배터리",
    description: "남은 버리기마다 +25 POWER (최대 +75)",
    rarity: "uncommon",
    price: 6,
  },
  "last-commit": {
    id: "last-commit",
    name: "라스트 커밋",
    description: "마지막 핸드에 +12 HYPE",
    rarity: "uncommon",
    price: 6,
  },
  "version-control": {
    id: "version-control",
    name: "버전 관리",
    description: "직전 핸드와 다른 족보면 +60 POWER",
    rarity: "uncommon",
    price: 6,
  },
  "cmyk-core": {
    id: "cmyk-core",
    name: "CMYK 코어",
    description: "득점 카드에 4색이 모두 있으면 MAYHEM ×1.75",
    rarity: "rare",
    price: 8,
  },
  "combo-compiler": {
    id: "combo-compiler",
    name: "콤보 컴파일러",
    description: "서로 다른 족보 연속 사용마다 MAYHEM +×0.15 (최대 ×1.75)",
    rarity: "rare",
    price: 8,
  },
  "hot-swap": {
    id: "hot-swap",
    name: "핫 스왑",
    description: "선택한 색 득점 카드의 숫자 POWER를 두 번 더 계산하고 2장 이상이면 +4 HYPE",
    rarity: "rare",
    price: 8,
  },
  "null-pointer": {
    id: "null-pointer",
    name: "널 포인터",
    description: "0이 2장 이상 득점하면 MAYHEM ×2.25",
    rarity: "rare",
    price: 8,
  },
};

export const JOKER_IDS = Object.freeze(
  Object.keys(JOKER_CATALOG) as JokerId[],
);

export const UNO_MODULE_CATALOG: Readonly<
  Record<UnoModuleId, UnoModuleDefinition>
> = {
  "color-burst": {
    id: "color-burst",
    name: "컬러 버스트",
    description: "호출한 색이 2장 이상 득점하면 +8 칩",
    kind: "positive",
    points: 1,
  },
  "number-echo": {
    id: "number-echo",
    name: "넘버 에코",
    description: "가장 높은 숫자 칩을 한 번 더 획득 (최대 +10)",
    kind: "positive",
    points: 1,
  },
  "steady-mult": {
    id: "steady-mult",
    name: "스테디 멀트",
    description: "+1 배수",
    kind: "positive",
    points: 1,
  },
  "low-frequency": {
    id: "low-frequency",
    name: "저주파 증폭",
    description: "득점한 0~3 카드마다 +3 칩 (최대 +12)",
    kind: "positive",
    points: 1,
  },
  "double-call": {
    id: "double-call",
    name: "더블 콜",
    description: "호출한 색마다 추가 +2 칩 (최대 +10)",
    kind: "positive",
    points: 2,
  },
  "spectrum-drive": {
    id: "spectrum-drive",
    name: "스펙트럼 드라이브",
    description: "득점 카드가 3색 이상이면 +2 배수",
    kind: "positive",
    points: 2,
  },
  "precision-boost": {
    id: "precision-boost",
    name: "프리시전 부스트",
    description: "정확히 5장이 득점하면 UNO 적용 점수 ×1.25",
    kind: "positive",
    points: 2,
  },
  "last-signal": {
    id: "last-signal",
    name: "라스트 시그널",
    description: "마지막 핸드면 UNO 적용 점수 ×1.30",
    kind: "positive",
    points: 2,
  },
  "off-color-tax": {
    id: "off-color-tax",
    name: "오프 컬러 세금",
    description: "호출하지 않은 색마다 UNO 칩 -2 (최대 -8)",
    kind: "negative",
    points: -1,
  },
  "signal-loss": {
    id: "signal-loss",
    name: "신호 손실",
    description: "UNO 칩 -6",
    kind: "negative",
    points: -1,
  },
  "mult-drain": {
    id: "mult-drain",
    name: "배수 누수",
    description: "UNO 배수 -1",
    kind: "negative",
    points: -1,
  },
  "narrow-band": {
    id: "narrow-band",
    name: "협대역",
    description: "Color Call의 최대 보너스가 +6 칩으로 감소",
    kind: "negative",
    points: -1,
  },
  "glass-output": {
    id: "glass-output",
    name: "글래스 출력",
    description: "UNO 적용 결과 ×0.75",
    kind: "negative",
    points: -2,
  },
  "single-channel": {
    id: "single-channel",
    name: "싱글 채널",
    description: "호출한 색이 2장 미만이면 긍정 모듈이 작동하지 않음",
    kind: "negative",
    points: -2,
  },
  "weak-start": {
    id: "weak-start",
    name: "약한 출력",
    description: "긍정 모듈로 얻는 추가 칩이 절반으로 감소",
    kind: "negative",
    points: -2,
  },
  "hard-cap": {
    id: "hard-cap",
    name: "하드 캡",
    description: "UNO 점수 상한이 ×1.60에서 ×1.30으로 감소",
    kind: "negative",
    points: -2,
  },
};

export const DEFAULT_COMMUNITY_UNO_CARDS: readonly CommunityUnoCard[] = [
  {
    id: "community-first-signal",
    name: "첫 번째 신호",
    author: "DECK MAYHEM",
    version: 1,
    positiveModules: ["steady-mult"],
    negativeModules: ["mult-drain"],
  },
  {
    id: "community-color-overdrive",
    name: "컬러 오버드라이브",
    author: "DECK MAYHEM",
    version: 1,
    positiveModules: ["double-call"],
    negativeModules: ["hard-cap"],
  },
  {
    id: "community-precision-glass",
    name: "정밀 유리",
    author: "DECK MAYHEM",
    version: 1,
    positiveModules: ["precision-boost"],
    negativeModules: ["glass-output"],
  },
  {
    id: "community-low-pulse",
    name: "저주파 펄스",
    author: "DECK MAYHEM",
    version: 1,
    positiveModules: ["low-frequency", "number-echo"],
    negativeModules: ["signal-loss", "off-color-tax"],
  },
];

export function rankChipValue(rank: number): number {
  return rank === 0 ? 10 : rank + 1;
}

export function targetForRound(ante: number, round: RoundType): number {
  const fixed = ROUND_TARGETS[ante];
  if (fixed) return fixed[round];

  const base = ROUND_TARGETS[5][round];
  const scaled = base * 1.8 ** (ante - 5);
  return Math.round(scaled / 25) * 25;
}
