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

// Every hand type grows +0.3% POWER / +0.2% HYPE per CORE level, except
// four-of-a-kind and straight-flush, which grow more slowly at +0.1% each.
const DEFAULT_CHIP_GROWTH_RATE = 0.003;
const DEFAULT_MULT_GROWTH_RATE = 0.002;
const SLOW_CHIP_GROWTH_RATE = 0.001;
const SLOW_MULT_GROWTH_RATE = 0.001;

export const HAND_RULES: Readonly<Record<HandType, HandRule>> = {
  "high-card": {
    type: "high-card",
    name: "하이 카드",
    baseChips: 5,
    baseMultiplier: 1,
    chipGrowthRate: DEFAULT_CHIP_GROWTH_RATE,
    multGrowthRate: DEFAULT_MULT_GROWTH_RATE,
  },
  pair: {
    type: "pair",
    name: "페어",
    baseChips: 10,
    baseMultiplier: 2,
    chipGrowthRate: DEFAULT_CHIP_GROWTH_RATE,
    multGrowthRate: DEFAULT_MULT_GROWTH_RATE,
  },
  "two-pair": {
    type: "two-pair",
    name: "투 페어",
    baseChips: 25,
    baseMultiplier: 3,
    chipGrowthRate: DEFAULT_CHIP_GROWTH_RATE,
    multGrowthRate: DEFAULT_MULT_GROWTH_RATE,
  },
  "three-of-a-kind": {
    type: "three-of-a-kind",
    name: "트리플",
    baseChips: 35,
    baseMultiplier: 3,
    chipGrowthRate: DEFAULT_CHIP_GROWTH_RATE,
    multGrowthRate: DEFAULT_MULT_GROWTH_RATE,
  },
  straight: {
    type: "straight",
    name: "스트레이트",
    baseChips: 45,
    baseMultiplier: 4,
    chipGrowthRate: DEFAULT_CHIP_GROWTH_RATE,
    multGrowthRate: DEFAULT_MULT_GROWTH_RATE,
  },
  flush: {
    type: "flush",
    name: "플러시",
    baseChips: 50,
    baseMultiplier: 4,
    chipGrowthRate: DEFAULT_CHIP_GROWTH_RATE,
    multGrowthRate: DEFAULT_MULT_GROWTH_RATE,
  },
  "full-house": {
    type: "full-house",
    name: "풀 하우스",
    baseChips: 55,
    baseMultiplier: 4,
    chipGrowthRate: DEFAULT_CHIP_GROWTH_RATE,
    multGrowthRate: DEFAULT_MULT_GROWTH_RATE,
  },
  "four-of-a-kind": {
    type: "four-of-a-kind",
    name: "포 카드",
    baseChips: 110,
    baseMultiplier: 9,
    chipGrowthRate: SLOW_CHIP_GROWTH_RATE,
    multGrowthRate: SLOW_MULT_GROWTH_RATE,
  },
  "straight-flush": {
    type: "straight-flush",
    name: "스트레이트 플러시",
    baseChips: 160,
    baseMultiplier: 12,
    chipGrowthRate: SLOW_CHIP_GROWTH_RATE,
    multGrowthRate: SLOW_MULT_GROWTH_RATE,
  },
};

export function effectiveHandChips(rule: HandRule, level: number): number {
  return Math.round(
    rule.baseChips * (1 + rule.chipGrowthRate * Math.max(0, level - 1)),
  );
}

export function effectiveHandMultiplier(rule: HandRule, level: number): number {
  return (
    Math.round(
      rule.baseMultiplier *
        (1 + rule.multGrowthRate * Math.max(0, level - 1)) *
        100,
    ) / 100
  );
}

/**
 * Ante 1-5 targets grow gently (~1.5x per ante) so a standard run stays
 * approachable. Endless mode (ante 6+) is computed by targetForRound below,
 * where the per-ante ratio starts higher and eases down toward a floor —
 * matching how a player's own power growth slows down the longer a run goes.
 */
export const ROUND_TARGETS: Readonly<
  Record<number, Readonly<Record<RoundType, number>>>
> = {
  1: { small: 500, big: 650, boss: 825 },
  2: { small: 750, big: 975, boss: 1240 },
  3: { small: 1125, big: 1465, boss: 1855 },
  4: { small: 1690, big: 2195, boss: 2785 },
  5: { small: 2530, big: 3290, boss: 4175 },
};

const ROUND_TYPE_TARGET_MULTIPLIER: Readonly<Record<RoundType, number>> = {
  small: 1,
  big: 1.3,
  boss: 1.65,
};

const ENDLESS_RATIO_BASE = 1.6;
const ENDLESS_RATIO_STEP = -0.05;
const ENDLESS_RATIO_FLOOR = 1.15;

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
  "venom-drip": {
    id: "venom-drip",
    name: "베놈 드립",
    description: "득점한 VENOM 카드마다 +3 HYPE (최대 +15)",
    rarity: "common",
    price: 4,
  },
  "volt-surge": {
    id: "volt-surge",
    name: "볼트 서지",
    description: "득점한 VOLT 카드마다 +10 POWER (최대 +50)",
    rarity: "common",
    price: 4,
  },
  "half-compile": {
    id: "half-compile",
    name: "하프 컴파일",
    description: "제출 카드가 3장 이하면 +10 HYPE",
    rarity: "common",
    price: 4,
  },
  "ice-cream-cache": {
    id: "ice-cream-cache",
    name: "아이스크림 캐시",
    description: "라운드 시작 시 +48 POWER, 핸드를 낼 때마다 -12 POWER (최저 0)",
    rarity: "common",
    price: 4,
  },
  "memory-buffer": {
    id: "memory-buffer",
    name: "메모리 버퍼",
    description: "남은 핸드 횟수마다 +18 POWER (최대 +54)",
    rarity: "common",
    price: 4,
  },
  "mystic-summit": {
    id: "mystic-summit",
    name: "미스틱 서밋",
    description: "버리기를 모두 소진했으면 +3 HYPE",
    rarity: "common",
    price: 4,
  },
  "delayed-gratification": {
    id: "delayed-gratification",
    name: "지연 보상",
    description: "버리기 0회로 라운드를 클리어하면 +6코인",
    rarity: "common",
    price: 4,
  },
  "fibonacci-routine": {
    id: "fibonacci-routine",
    name: "피보나치 루틴",
    description: "득점 카드 중 1·2·3·5·8 랭크마다 +3 HYPE (최대 +15)",
    rarity: "common",
    price: 4,
  },
  "loyalty-session": {
    id: "loyalty-session",
    name: "충성 세션",
    description: "6번째 핸드마다 +15 HYPE",
    rarity: "common",
    price: 4,
  },
  "jolly-routine": {
    id: "jolly-routine",
    name: "졸리 루틴",
    description: "페어로 득점하면 +8 HYPE",
    rarity: "common",
    price: 4,
  },
  "zany-core": {
    id: "zany-core",
    name: "제니 코어",
    description: "트리플로 득점하면 +12 HYPE",
    rarity: "common",
    price: 4,
  },
  "mad-routine": {
    id: "mad-routine",
    name: "매드 루틴",
    description: "투페어로 득점하면 +10 HYPE",
    rarity: "common",
    price: 4,
  },
  "runner-process": {
    id: "runner-process",
    name: "런너 프로세스",
    description: "스트레이트로 득점할 때마다 영구 +15 POWER",
    rarity: "uncommon",
    price: 6,
  },
  "green-demon": {
    id: "green-demon",
    name: "그린 데몬",
    description: "핸드를 낼 때마다 HYPE +1, 버리기할 때마다 HYPE -1 (누적치 최저 0)",
    rarity: "uncommon",
    price: 6,
  },
  "eight-ball-exploit": {
    id: "eight-ball-exploit",
    name: "8볼 익스플로잇",
    description: "득점 카드에 8이 있으면 25% 확률로 +3코인",
    rarity: "uncommon",
    price: 6,
  },
  "bloodstone-driver": {
    id: "bloodstone-driver",
    name: "혈석 드라이버",
    description: "득점한 RAGE 카드마다 50% 확률로 MAYHEM ×1.2",
    rarity: "uncommon",
    price: 6,
  },
  "reserved-slot": {
    id: "reserved-slot",
    name: "예약 슬롯",
    description: "보유 손패의 0 카드마다 50% 확률로 +1코인",
    rarity: "uncommon",
    price: 6,
  },
  "turtle-bean-cache": {
    id: "turtle-bean-cache",
    name: "터틀빈 압축",
    description: "손패 크기 +2, 이후 5라운드에 걸쳐 매 라운드 감소",
    rarity: "uncommon",
    price: 6,
  },
  "spare-trousers": {
    id: "spare-trousers",
    name: "스페어 트라우저",
    description: "투페어로 득점할 때마다 영구 +1 HYPE",
    rarity: "uncommon",
    price: 6,
  },
  "blueprint-protocol": {
    id: "blueprint-protocol",
    name: "블루프린트 프로토콜",
    description: "오른쪽 MOD의 효과를 그대로 복제합니다 (없으면 무효)",
    rarity: "rare",
    price: 8,
  },
  "cavendish-overclock": {
    id: "cavendish-overclock",
    name: "카벤디시 오버클럭",
    description: "MAYHEM ×2. 라운드 클리어 시 5% 확률로 이 MOD가 파괴됨",
    rarity: "rare",
    price: 8,
  },
  "perkeos-echo": {
    id: "perkeos-echo",
    name: "퍼케오의 메아리",
    description: "라운드 클리어 시 20% 확률로 보유 프로토콜/고스트 카드 1장을 복제",
    rarity: "rare",
    price: 8,
  },
  "stencil-core": {
    id: "stencil-core",
    name: "스텐실 코어",
    description: "비어있는 MOD 슬롯 하나당 MAYHEM +×0.3",
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
    description: "득점 카드 중 호출한 색 카드가 2장 이상이면 +10 POWER",
    kind: "positive",
    points: 1,
  },
  "number-echo": {
    id: "number-echo",
    name: "넘버 에코",
    description: "득점 카드 중 숫자가 가장 높은 카드 1장의 숫자 POWER를 한 번 더 계산합니다",
    kind: "positive",
    points: 1,
  },
  "steady-mult": {
    id: "steady-mult",
    name: "스테디 멀트",
    description: "3장 이상 득점하면 +2 HYPE",
    kind: "positive",
    points: 1,
  },
  "low-frequency": {
    id: "low-frequency",
    name: "저주파 증폭",
    description: "득점한 0~3 카드마다 +3 POWER (최대 +12)",
    kind: "positive",
    points: 1,
  },
  "double-call": {
    id: "double-call",
    name: "더블 콜",
    description: "라운드 시작 시 색을 2개 호출합니다. 두 색 모두 Color Call 효과를 받습니다",
    kind: "positive",
    points: 2,
  },
  "spectrum-drive": {
    id: "spectrum-drive",
    name: "스펙트럼 드라이브",
    description: "득점 카드에 서로 다른 색이 3종 이상 있으면 +15 POWER, +3 HYPE",
    kind: "positive",
    points: 2,
  },
  "precision-boost": {
    id: "precision-boost",
    name: "프리시전 부스트",
    description: "정확히 5장이 득점하면 MAYHEM ×1.40",
    kind: "positive",
    points: 2,
  },
  "last-signal": {
    id: "last-signal",
    name: "라스트 시그널",
    description: "남은 핸드가 1회일 때 MAYHEM ×1.50",
    kind: "positive",
    points: 2,
  },
  "off-color-tax": {
    id: "off-color-tax",
    name: "오픈 컬러 세금",
    description: "득점 카드에 호출하지 않은 색 1종마다 -2 POWER (최대 -6)",
    kind: "negative",
    points: -1,
  },
  "signal-loss": {
    id: "signal-loss",
    name: "신호 손실",
    description: "MAYHEM POWER -5",
    kind: "negative",
    points: -1,
  },
  "mult-drain": {
    id: "mult-drain",
    name: "배수 누수",
    description: "MAYHEM HYPE -1 (최소 1)",
    kind: "negative",
    points: -1,
  },
  "boot-delay": {
    id: "boot-delay",
    name: "부팅 지연",
    description: "라운드 첫 핸드에서는 MAYHEM POWER -10",
    kind: "negative",
    points: -1,
  },
  "glass-output": {
    id: "glass-output",
    name: "글래스 충격",
    description: "MAYHEM 최종 점수 ×0.85",
    kind: "negative",
    points: -2,
  },
  "memory-pressure": {
    id: "memory-pressure",
    name: "메모리 압박",
    description: "손패 크기 -1",
    kind: "negative",
    points: -2,
  },
  "battery-drain": {
    id: "battery-drain",
    name: "배터리 드레인",
    description: "라운드 시작 시 버리기 -1",
    kind: "negative",
    points: -2,
  },
  "lockup-process": {
    id: "lockup-process",
    name: "홀업 프로세스",
    description: "라운드 첫 핸드에서는 선택한 좋은 효과가 작동하지 않습니다",
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
    negativeModules: ["lockup-process"],
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

  let base = ROUND_TARGETS[5].small;
  for (let depth = 1; depth <= ante - 5; depth += 1) {
    const ratio = Math.max(
      ENDLESS_RATIO_FLOOR,
      ENDLESS_RATIO_BASE + ENDLESS_RATIO_STEP * (depth - 1),
    );
    base *= ratio;
  }
  const scaled = base * ROUND_TYPE_TARGET_MULTIPLIER[round];
  return Math.round(scaled / 25) * 25;
}
