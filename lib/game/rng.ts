/** Stable 32-bit FNV-1a hash used to turn user-facing seeds into RNG state. */
export function hashSeed(seed: string | number): number {
  const text = String(seed);
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/** One deterministic Mulberry32 step. The caller stores nextState in RunState. */
export function nextRandom(state: number): {
  readonly value: number;
  readonly nextState: number;
} {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let value = nextState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  const result = ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  return { value: result, nextState };
}

export function randomInt(
  state: number,
  minimum: number,
  maximumExclusive: number,
): { readonly value: number; readonly nextState: number } {
  if (!Number.isInteger(minimum) || !Number.isInteger(maximumExclusive)) {
    throw new TypeError("randomInt bounds must be integers");
  }
  if (maximumExclusive <= minimum) {
    throw new RangeError("maximumExclusive must be greater than minimum");
  }

  const random = nextRandom(state);
  return {
    value: minimum + Math.floor(random.value * (maximumExclusive - minimum)),
    nextState: random.nextState,
  };
}

export function shuffle<T>(
  values: readonly T[],
  state: number,
): { readonly values: readonly T[]; readonly nextState: number } {
  const shuffled = [...values];
  let nextState = state;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const random = randomInt(nextState, 0, index + 1);
    nextState = random.nextState;
    [shuffled[index], shuffled[random.value]] = [
      shuffled[random.value],
      shuffled[index],
    ];
  }

  return { values: shuffled, nextState };
}
