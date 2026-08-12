import { JOKER_SLOT_LIMIT, STARTING_HAND_SIZE } from "./constants";
import { CONSUMABLE_SLOT_LIMIT, FIRMWARE_CONFIG } from "./garage-config";
import type {
  ConsumableInstance,
  FirmwareId,
  RunState,
} from "./types";

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
  return firmwareCount(state, firmwareId) < FIRMWARE_CONFIG[firmwareId].maxStacks;
}

export function jokerSlotLimitFor(state: RunState): number {
  return JOKER_SLOT_LIMIT + firmwareCount(state, "expanded-mod-bay");
}

export function consumableSlotsFree(state: RunState): number {
  return Math.max(0, CONSUMABLE_SLOT_LIMIT - runConsumables(state).length);
}

export function nextRoundHandSizeFor(state: RunState): number {
  return Math.max(
    3,
    STARTING_HAND_SIZE +
      firmwareCount(state, "hand-memory") -
      Math.max(0, state.nextRoundHandPenalty ?? 0),
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
