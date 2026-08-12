import {
  DISCARDS_PER_ROUND,
  JOKER_SLOT_LIMIT,
  STARTING_HAND_SIZE,
} from "./constants";
import { FIRMWARE_CONFIG } from "./garage-config";
import type {
  ConsumableInstance,
  FirmwareId,
  RunState,
} from "./types";

const TURTLE_BEAN_HAND_BONUS = 2;

/** Legacy v1 saves have no consumable inventory. */
export function runConsumables(state: RunState): readonly ConsumableInstance[] {
  return state.consumables ?? [];
}

/** Legacy v1 saves have no firmware inventory. */
export function runFirmware(state: RunState): readonly FirmwareId[] {
  return state.firmware ?? [];
}

export function firmwareCount(state: RunState, firmwareId: FirmwareId): number {
  return runFirmware(state).filter((candidate) => candidate === firmwareId).length;
}

export function canInstallFirmware(state: RunState, firmwareId: FirmwareId): boolean {
  return true;
}

export function jokerSlotLimitFor(state: RunState): number {
  return JOKER_SLOT_LIMIT + firmwareCount(state, "expanded-mod-bay");
}

function turtleBeanBonusFor(state: RunState): number {
  const active = state.jokers.some(
    (joker) => joker.jokerId === "turtle-bean-cache" && (joker.counter ?? 0) > 0,
  );
  return active ? TURTLE_BEAN_HAND_BONUS : 0;
}

export function nextRoundHandSizeFor(state: RunState): number {
  return Math.max(
    3,
    STARTING_HAND_SIZE +
      firmwareCount(state, "hand-memory") +
      turtleBeanBonusFor(state) -
      Math.max(0, state.nextRoundHandPenalty ?? 0),
  );
}

/** The discard budget a fresh round starts with, before any are spent. */
export function discardsPerRoundFor(state: RunState): number {
  return Math.max(
    0,
    DISCARDS_PER_ROUND +
      firmwareCount(state, "recycle-unit") -
      Math.max(0, state.permanentDiscardPenalty ?? 0),
  );
}

export function rerollBaseCostFor(state: RunState): number {
  return Math.max(1, 2 - firmwareCount(state, "reroll-cache"));
}

export function packPriceFor(state: RunState, basePrice: number): number {
  return Math.max(1, basePrice - firmwareCount(state, "wholesale-link"));
}

export function packRevealBonusFor(state: RunState): number {
  return firmwareCount(state, "signal-scanner");
}

export function roundRewardBonusFor(state: RunState): number {
  return firmwareCount(state, "reward-amplifier");
}
