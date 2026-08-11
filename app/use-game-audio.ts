"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLocalSetting, setLocalSetting } from "../lib/offline";

export type AudioScene = "menu" | "run" | "shop" | "boss" | "final-boss" | "silent";
export type AudioChannel = "music" | "effects";
export type SoundEffect =
  | "card-select"
  | "card-play"
  | "card-draw"
  | "deck-setup"
  | "score"
  | "buy"
  | "uno"
  | "pack-open"
  | "pack-reveal"
  | "win"
  | "lose";

type AudioAsset = {
  readonly src: string;
  readonly gain: number;
  readonly playbackRate?: number;
};

type AudioSetting = "musicEnabled" | "effectsEnabled" | "musicVolume" | "effectsVolume";

export interface EffectPlaybackOptions {
  /** Additional pitch in semitones. */
  readonly semitoneOffset?: number;
  /** Zero-based index used to raise repeated sounds such as score ticks. */
  readonly progressionStep?: number;
  /** Pitch distance between progression steps. */
  readonly semitonesPerStep?: number;
  /** Direct playback-rate override. Prefer semitone options for score ticks. */
  readonly playbackRate?: number;
  /** Per-call multiplier applied after the effect and channel gains. */
  readonly gain?: number;
  /** Maximum simultaneous voices for this effect (1-8). */
  readonly maxVoices?: number;
}

export interface ScoreTickOptions {
  readonly semitonesPerStep?: number;
  readonly semitoneOffset?: number;
  readonly gain?: number;
  readonly maxVoices?: number;
}

export const BGM_CROSSFADE_MS = 550;
export const DEFAULT_EFFECT_VOICE_LIMIT = 4;
export const DEFAULT_SCORE_TICK_VOICE_LIMIT = 3;
export const DEFAULT_SCORE_TICK_SEMITONES = 1.25;
/** `score.mp3` has a short encoded lead-in; skip it for a tighter card hit. */
export const SCORE_EFFECT_START_OFFSET_SECONDS = 0.028;
/** Normal score beats are 240ms, so the tick must release before the next hit. */
export const SCORE_EFFECT_MAX_DURATION_MS = 220;
export const SCORE_EFFECT_FADE_DURATION_MS = 36;

export const AUDIO_TRACKS = {
  menu: { src: "/audio/bgm-menu.m4a", gain: 0.82 },
  run: { src: "/audio/bgm-run.m4a", gain: 0.74 },
  shop: { src: "/audio/bgm-shop.mp3", gain: 0.76 },
  boss: { src: "/audio/bgm-boss.mp3", gain: 0.86 },
  "final-boss": { src: "/audio/bgm-final-boss.mp3", gain: 0.92 },
  silent: null,
} as const satisfies Readonly<Record<AudioScene, AudioAsset | null>>;

export const AUDIO_EFFECTS = {
  "card-select": { src: "/audio/card-select.m4a", gain: 0.48 },
  "card-play": { src: "/audio/card-play.mp3", gain: 0.82 },
  "card-draw": { src: "/audio/card-draw.mp3", gain: 0.68 },
  "deck-setup": { src: "/audio/deck-setup.mp3", gain: 0.82 },
  score: { src: "/audio/score.mp3", gain: 0.58 },
  buy: { src: "/audio/buy.m4a", gain: 0.72 },
  uno: { src: "/audio/uno.m4a", gain: 0.68 },
  "pack-open": { src: "/audio/pack-open.m4a", gain: 0.82 },
  "pack-reveal": { src: "/audio/pack-reveal.m4a", gain: 0.6 },
  win: { src: "/audio/win.m4a", gain: 0.8 },
  lose: { src: "/audio/lose.m4a", gain: 0.72 },
} as const satisfies Readonly<Record<SoundEffect, AudioAsset | null>>;

export function audioSceneForBossAnte(ante: number): Extract<AudioScene, "boss" | "final-boss"> {
  return ante >= 5 ? "final-boss" : "boss";
}

export function scoreTickPlaybackRate(
  progressionStep: number,
  semitonesPerStep = DEFAULT_SCORE_TICK_SEMITONES,
  semitoneOffset = 0,
): number {
  const safeStep = Number.isFinite(progressionStep) ? Math.max(0, progressionStep) : 0;
  const safeStepSize = Number.isFinite(semitonesPerStep) ? semitonesPerStep : DEFAULT_SCORE_TICK_SEMITONES;
  const safeOffset = Number.isFinite(semitoneOffset) ? semitoneOffset : 0;
  const rate = 2 ** ((safeOffset + safeStep * safeStepSize) / 12);
  return Math.max(0.65, Math.min(1.8, rate));
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampVoiceLimit(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(8, Math.floor(value ?? fallback)));
}

function releaseAudio(audio: HTMLAudioElement): void {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

type ScorePoolVoice = {
  readonly audio: HTMLAudioElement;
  readonly timers: Set<ReturnType<typeof setTimeout>>;
  callGain: number;
};

export interface ScoreEffectPoolOptions {
  readonly src: string;
  readonly gain: number;
  readonly voiceLimit?: number;
  readonly startOffsetSeconds?: number;
  readonly maxDurationMs?: number;
  readonly fadeDurationMs?: number;
}

/**
 * A small, eagerly loaded voice pool for score hits. Reusing decoded media
 * elements avoids the per-card construction/decode latency of `new Audio()`.
 * Event tokens make playback idempotent across React re-renders.
 */
export class ScoreEffectPool {
  private readonly voices: ScorePoolVoice[] = [];
  private readonly playedTokens = new Set<string>();
  private readonly tokenOrder: string[] = [];
  private cursor = 0;
  private enabled = false;
  private masterVolume = 0.65;

  constructor(private readonly options: ScoreEffectPoolOptions) {}

  get preparedVoiceCount(): number {
    return this.voices.length;
  }

  prepare(): void {
    if (this.voices.length > 0 || typeof Audio === "undefined") return;
    const voiceLimit = clampVoiceLimit(
      this.options.voiceLimit,
      DEFAULT_SCORE_TICK_VOICE_LIMIT,
    );
    for (let index = 0; index < voiceLimit; index += 1) {
      const audio = new Audio(this.options.src);
      audio.preload = "auto";
      audio.volume = 0;
      audio.load();
      this.voices.push({ audio, timers: new Set(), callGain: 1 });
    }
  }

  configure(enabled: boolean, masterVolume: number): void {
    this.enabled = enabled;
    this.masterVolume = clampVolume(masterVolume);
    if (!enabled) {
      this.stop();
      return;
    }
    this.prepare();
    for (const voice of this.voices) {
      if (!voice.audio.paused && !voice.audio.ended) {
        voice.audio.volume = this.voiceVolume(voice);
      }
    }
  }

  play(
    eventToken: string,
    options: { readonly playbackRate: number; readonly gain?: number },
  ): boolean {
    if (this.playedTokens.has(eventToken)) return false;
    this.rememberToken(eventToken);
    if (!this.enabled) return false;
    this.prepare();
    if (this.voices.length === 0) return false;

    const idleIndex = this.voices.findIndex(
      ({ audio }) => audio.paused || audio.ended,
    );
    const voiceIndex = idleIndex >= 0 ? idleIndex : this.cursor % this.voices.length;
    this.cursor = (voiceIndex + 1) % this.voices.length;
    const voice = this.voices[voiceIndex];
    this.clearVoiceTimers(voice);
    voice.audio.pause();
    voice.callGain = Number.isFinite(options.gain)
      ? Math.max(0, options.gain ?? 1)
      : 1;
    voice.audio.playbackRate = Math.max(0.5, Math.min(2, options.playbackRate));
    voice.audio.volume = this.voiceVolume(voice);
    try {
      voice.audio.currentTime = this.options.startOffsetSeconds
        ?? SCORE_EFFECT_START_OFFSET_SECONDS;
    } catch {
      // Safari can reject a seek before metadata is ready. The preloaded pool
      // still removes allocation/decode latency, so starting at zero is safe.
    }
    voice.audio.play().catch(() => this.stopVoice(voice));
    this.scheduleTailRelease(voice);
    return true;
  }

  stop(): void {
    for (const voice of this.voices) this.stopVoice(voice);
  }

  dispose(): void {
    this.stop();
    for (const voice of this.voices) releaseAudio(voice.audio);
    this.voices.length = 0;
    this.playedTokens.clear();
    this.tokenOrder.length = 0;
  }

  private rememberToken(token: string): void {
    this.playedTokens.add(token);
    this.tokenOrder.push(token);
    while (this.tokenOrder.length > 512) {
      const oldest = this.tokenOrder.shift();
      if (oldest !== undefined) this.playedTokens.delete(oldest);
    }
  }

  private voiceVolume(voice: ScorePoolVoice): number {
    return clampVolume(this.masterVolume * this.options.gain * voice.callGain);
  }

  private scheduleTailRelease(voice: ScorePoolVoice): void {
    const maxDuration = Math.max(
      40,
      this.options.maxDurationMs ?? SCORE_EFFECT_MAX_DURATION_MS,
    );
    const fadeDuration = Math.min(
      maxDuration,
      Math.max(0, this.options.fadeDurationMs ?? SCORE_EFFECT_FADE_DURATION_MS),
    );
    const fadeStart = Math.max(0, maxDuration - fadeDuration);
    const addTimer = (delay: number, action: () => void) => {
      const timer = setTimeout(() => {
        voice.timers.delete(timer);
        action();
      }, delay);
      voice.timers.add(timer);
    };

    if (fadeDuration > 0) {
      addTimer(fadeStart, () => {
        voice.audio.volume = this.voiceVolume(voice) * 0.58;
      });
      addTimer(fadeStart + fadeDuration * 0.55, () => {
        voice.audio.volume = this.voiceVolume(voice) * 0.2;
      });
    }
    addTimer(maxDuration, () => this.stopVoice(voice));
  }

  private clearVoiceTimers(voice: ScorePoolVoice): void {
    for (const timer of voice.timers) clearTimeout(timer);
    voice.timers.clear();
  }

  private stopVoice(voice: ScorePoolVoice): void {
    this.clearVoiceTimers(voice);
    voice.audio.pause();
    voice.audio.volume = 0;
  }
}

type ManagedBgmTrack = {
  definition: AudioAsset;
  readonly audio: HTMLAudioElement;
};

/**
 * The module owns exactly one BGM manager. Scene changes briefly keep one
 * outgoing voice for the crossfade, then release it. Re-rendering or remounting
 * with the same source reuses the current element and its playback position.
 */
export class BgmManager {
  private current: ManagedBgmTrack | null = null;
  private outgoing: ManagedBgmTrack | null = null;
  private enabled = false;
  private masterVolume = 0.35;
  private readonly fadeFrames = new Map<HTMLAudioElement, number>();

  setScene(scene: AudioScene): void {
    const definition: AudioAsset | null = AUDIO_TRACKS[scene];
    if (definition && this.current?.definition.src === definition.src) {
      this.current.definition = definition;
      this.syncCurrentTrack();
      return;
    }

    if (this.outgoing) {
      this.stopTrack(this.outgoing);
      this.outgoing = null;
    }

    const previous = this.current;
    this.current = definition ? this.createTrack(definition) : null;

    if (!this.enabled) {
      if (previous) this.stopTrack(previous);
      return;
    }

    if (previous) {
      this.outgoing = previous;
      this.fade(previous.audio, 0, BGM_CROSSFADE_MS, () => {
        if (this.outgoing === previous) this.outgoing = null;
        this.stopTrack(previous);
      });
    }

    if (this.current) {
      const next = this.current;
      next.audio.volume = 0;
      next.audio.play().catch(() => undefined);
      this.fade(next.audio, this.trackVolume(next), BGM_CROSSFADE_MS);
    }
  }

  configure(enabled: boolean, masterVolume: number): void {
    const wasEnabled = this.enabled;
    this.enabled = enabled;
    this.masterVolume = clampVolume(masterVolume);

    if (!enabled) {
      if (this.outgoing) {
        this.stopTrack(this.outgoing);
        this.outgoing = null;
      }
      if (this.current) {
        this.cancelFade(this.current.audio);
        this.current.audio.volume = 0;
        this.current.audio.pause();
      }
      return;
    }

    if (!this.current) return;
    const target = this.trackVolume(this.current);
    if (!wasEnabled) {
      this.current.audio.volume = 0;
      this.current.audio.play().catch(() => undefined);
      this.fade(this.current.audio, target, 350);
      return;
    }

    this.cancelFade(this.current.audio);
    this.current.audio.volume = target;
    if (this.current.audio.paused) this.current.audio.play().catch(() => undefined);
  }

  needsResume(): boolean {
    return Boolean(this.enabled && this.current?.audio.paused);
  }

  resume(): Promise<boolean> {
    const track = this.current;
    if (!this.enabled || !track) return Promise.resolve(true);
    return track.audio.play().then(() => {
      if (track.audio.volume === 0) this.fade(track.audio, this.trackVolume(track), 350);
      return true;
    }).catch(() => false);
  }

  private createTrack(definition: AudioAsset): ManagedBgmTrack {
    const audio = new Audio(definition.src);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
    return { audio, definition };
  }

  private syncCurrentTrack(): void {
    const track = this.current;
    if (!track) return;
    track.audio.volume = this.enabled ? this.trackVolume(track) : 0;
    if (this.enabled && track.audio.paused) track.audio.play().catch(() => undefined);
  }

  private trackVolume(track: ManagedBgmTrack): number {
    return clampVolume(this.masterVolume * track.definition.gain);
  }

  private fade(audio: HTMLAudioElement, targetVolume: number, durationMs: number, onDone?: () => void): void {
    this.cancelFade(audio);
    const initialVolume = audio.volume;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      audio.volume = clampVolume(initialVolume + (targetVolume - initialVolume) * progress);
      if (progress < 1) {
        this.fadeFrames.set(audio, requestAnimationFrame(tick));
        return;
      }
      this.fadeFrames.delete(audio);
      onDone?.();
    };

    this.fadeFrames.set(audio, requestAnimationFrame(tick));
  }

  private cancelFade(audio: HTMLAudioElement): void {
    const frame = this.fadeFrames.get(audio);
    if (frame !== undefined) cancelAnimationFrame(frame);
    this.fadeFrames.delete(audio);
  }

  private stopTrack(track: ManagedBgmTrack): void {
    this.cancelFade(track.audio);
    releaseAudio(track.audio);
  }
}

let centralBgmManager: BgmManager | null = null;

function getBgmManager(): BgmManager | null {
  if (typeof Audio === "undefined") return null;
  centralBgmManager ??= new BgmManager();
  return centralBgmManager;
}

export function useGameAudio(scene: AudioScene) {
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const [musicVolume, setMusicVolume] = useState(0.35);
  const [effectsVolume, setEffectsVolume] = useState(0.65);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const activeEffectsRef = useRef(new Map<SoundEffect, Set<HTMLAudioElement>>());
  const preloadedEffectsRef = useRef<HTMLAudioElement[]>([]);
  const effectGainsRef = useRef(new WeakMap<HTMLAudioElement, number>());
  const scorePoolRef = useRef<ScoreEffectPool | null>(null);
  const legacyScoreTokenRef = useRef(0);
  const scoreSequenceRef = useRef({ lastPlayedAt: 0, step: -1 });
  const changesBeforeHydrationRef = useRef(new Set<AudioSetting>());

  const markChangedBeforeHydration = useCallback((setting: AudioSetting) => {
    if (!settingsHydrated) changesBeforeHydrationRef.current.add(setting);
  }, [settingsHydrated]);

  const getScorePool = useCallback((): ScoreEffectPool | null => {
    if (typeof Audio === "undefined") return null;
    const definition = AUDIO_EFFECTS.score;
    scorePoolRef.current ??= new ScoreEffectPool({
      src: definition.src,
      gain: definition.gain,
      voiceLimit: DEFAULT_SCORE_TICK_VOICE_LIMIT,
    });
    return scorePoolRef.current;
  }, []);

  const stopEffects = useCallback(() => {
    for (const voices of activeEffectsRef.current.values()) {
      for (const sound of voices) releaseAudio(sound);
    }
    activeEffectsRef.current.clear();
    effectGainsRef.current = new WeakMap<HTMLAudioElement, number>();
    scorePoolRef.current?.stop();
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getLocalSetting("musicEnabled", true),
      getLocalSetting("effectsEnabled", true),
      getLocalSetting("musicVolume", 0.35),
      getLocalSetting("effectsVolume", 0.65),
    ]).then(([music, effects, musicLevel, effectsLevel]) => {
      if (cancelled) return;
      const changed = changesBeforeHydrationRef.current;
      if (!changed.has("musicEnabled")) {
        setMusicEnabled(typeof music === "boolean" ? music : true);
      }
      if (!changed.has("effectsEnabled")) {
        setEffectsEnabled(typeof effects === "boolean" ? effects : true);
      }
      if (!changed.has("musicVolume")) {
        setMusicVolume(Number.isFinite(musicLevel) ? clampVolume(musicLevel) : 0.35);
      }
      if (!changed.has("effectsVolume")) {
        setEffectsVolume(Number.isFinite(effectsLevel) ? clampVolume(effectsLevel) : 0.65);
      }
      setSettingsHydrated(true);
    }).catch(() => {
      if (!cancelled) setSettingsHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    getBgmManager()?.setScene(scene);
  }, [scene]);

  useEffect(() => {
    getBgmManager()?.configure(settingsHydrated && musicEnabled, musicVolume);
  }, [musicEnabled, musicVolume, settingsHydrated]);

  useEffect(() => {
    if (!settingsHydrated) return;
    setLocalSetting("musicEnabled", musicEnabled).catch(() => undefined);
  }, [musicEnabled, settingsHydrated]);

  useEffect(() => {
    if (!settingsHydrated) return;
    setLocalSetting("effectsEnabled", effectsEnabled).catch(() => undefined);
  }, [effectsEnabled, settingsHydrated]);

  useEffect(() => {
    if (!settingsHydrated) return;
    setLocalSetting("musicVolume", musicVolume).catch(() => undefined);
  }, [musicVolume, settingsHydrated]);

  useEffect(() => {
    if (!settingsHydrated) return;
    setLocalSetting("effectsVolume", effectsVolume).catch(() => undefined);
  }, [effectsVolume, settingsHydrated]);

  useEffect(() => {
    const scorePool = getScorePool();
    scorePool?.configure(settingsHydrated && effectsEnabled, effectsVolume);
    if (!effectsEnabled) {
      stopEffects();
      return;
    }
    for (const voices of activeEffectsRef.current.values()) {
      for (const sound of voices) {
        sound.volume = clampVolume(effectsVolume * (effectGainsRef.current.get(sound) ?? 1));
      }
    }
  }, [effectsEnabled, effectsVolume, getScorePool, settingsHydrated, stopEffects]);

  useEffect(() => {
    if (!settingsHydrated || !effectsEnabled || typeof Audio === "undefined") return;
    if (preloadedEffectsRef.current.length === 0) {
      const sources = new Set(
        Object.entries(AUDIO_EFFECTS)
          .filter(([name, definition]) => name !== "score" && definition !== null)
          .map(([, definition]) => definition!.src),
      );
      preloadedEffectsRef.current = [...sources].map((src) => {
        const audio = new Audio(src);
        audio.preload = "auto";
        audio.load();
        return audio;
      });
    }
    return () => {
      preloadedEffectsRef.current.forEach(releaseAudio);
      preloadedEffectsRef.current = [];
    };
  }, [effectsEnabled, settingsHydrated]);

  useEffect(() => {
    if (!musicEnabled || !settingsHydrated) return;

    let listening = true;
    const removeResumeListeners = () => {
      if (!listening) return;
      listening = false;
      window.removeEventListener("pointerdown", resumeMusic, true);
      window.removeEventListener("keydown", resumeMusic, true);
      window.removeEventListener("touchstart", resumeMusic, true);
    };
    const resumeMusic = () => {
      const manager = getBgmManager();
      if (!manager?.needsResume()) {
        removeResumeListeners();
        return;
      }
      manager.resume().then((started) => {
        if (started) removeResumeListeners();
      });
    };

    window.addEventListener("pointerdown", resumeMusic, true);
    window.addEventListener("keydown", resumeMusic, true);
    window.addEventListener("touchstart", resumeMusic, { capture: true, passive: true });
    return removeResumeListeners;
  }, [musicEnabled, scene, settingsHydrated]);

  const toggleMusic = useCallback(() => {
    const next = !musicEnabled;
    markChangedBeforeHydration("musicEnabled");
    setMusicEnabled(next);
    // Keep the play request in the click stack for Safari's autoplay policy.
    getBgmManager()?.configure(next, musicVolume);
  }, [markChangedBeforeHydration, musicEnabled, musicVolume]);

  const toggleEffects = useCallback(() => {
    markChangedBeforeHydration("effectsEnabled");
    setEffectsEnabled((enabled) => !enabled);
  }, [markChangedBeforeHydration]);

  const updateMusicVolume = useCallback((value: number) => {
    const next = clampVolume(value);
    markChangedBeforeHydration("musicVolume");
    setMusicVolume(next);
    getBgmManager()?.configure(musicEnabled, next);
  }, [markChangedBeforeHydration, musicEnabled]);

  const updateEffectsVolume = useCallback((value: number) => {
    markChangedBeforeHydration("effectsVolume");
    setEffectsVolume(clampVolume(value));
  }, [markChangedBeforeHydration]);

  const playPooledScore = useCallback((
    eventToken: string,
    progressionStep: number,
    options: ScoreTickOptions & Pick<EffectPlaybackOptions, "playbackRate"> = {},
  ): boolean => {
    const pool = getScorePool();
    if (!pool) return false;
    pool.configure(settingsHydrated && effectsEnabled, effectsVolume);
    const definition = AUDIO_EFFECTS.score;
    const playbackRate = options.playbackRate ?? (
      (definition.playbackRate ?? 1)
      * scoreTickPlaybackRate(
        progressionStep,
        options.semitonesPerStep ?? DEFAULT_SCORE_TICK_SEMITONES,
        options.semitoneOffset,
      )
    );
    return pool.play(eventToken, {
      playbackRate,
      gain: options.gain,
    });
  }, [effectsEnabled, effectsVolume, getScorePool, settingsHydrated]);

  const prepareScoreSequence = useCallback(() => {
    const pool = getScorePool();
    pool?.configure(settingsHydrated && effectsEnabled, effectsVolume);
    pool?.prepare();
  }, [effectsEnabled, effectsVolume, getScorePool, settingsHydrated]);

  const playScoreEvent = useCallback((
    eventToken: string,
    progressionStep: number,
    options: ScoreTickOptions = {},
  ): boolean => playPooledScore(eventToken, progressionStep, options), [playPooledScore]);

  const playEffect = useCallback((name: SoundEffect, options: EffectPlaybackOptions = {}) => {
    if (!settingsHydrated || !effectsEnabled) return;
    const definition: AudioAsset | null = AUDIO_EFFECTS[name];
    if (!definition) return;

    let progressionStep = options.progressionStep;
    if (name === "score" && progressionStep === undefined) {
      const now = performance.now();
      const sequence = scoreSequenceRef.current;
      sequence.step = now - sequence.lastPlayedAt > 1_200 ? 0 : sequence.step + 1;
      sequence.lastPlayedAt = now;
      progressionStep = sequence.step;
    }

    if (name === "score") {
      legacyScoreTokenRef.current += 1;
      playPooledScore(
        `legacy-score-${legacyScoreTokenRef.current}`,
        progressionStep ?? 0,
        options,
      );
      return;
    }

    const voiceLimit = clampVoiceLimit(options.maxVoices, DEFAULT_EFFECT_VOICE_LIMIT);
    const voices = activeEffectsRef.current.get(name) ?? new Set<HTMLAudioElement>();
    activeEffectsRef.current.set(name, voices);
    while (voices.size >= voiceLimit) {
      const oldest = voices.values().next().value;
      if (!oldest) break;
      voices.delete(oldest);
      releaseAudio(oldest);
    }

    const sound = new Audio(definition.src);
    sound.preload = "auto";
    const callGain = Number.isFinite(options.gain) ? Math.max(0, options.gain ?? 1) : 1;
    const effectiveGain = definition.gain * callGain;
    effectGainsRef.current.set(sound, effectiveGain);
    sound.volume = clampVolume(effectsVolume * effectiveGain);
    sound.playbackRate = options.playbackRate ?? (
      (definition.playbackRate ?? 1)
      * scoreTickPlaybackRate(
        progressionStep ?? 0,
        options.semitonesPerStep ?? 0,
        options.semitoneOffset,
      )
    );
    voices.add(sound);

    let released = false;
    const cleanup = () => {
      if (released) return;
      released = true;
      sound.removeEventListener("ended", cleanup);
      sound.removeEventListener("error", cleanup);
      voices.delete(sound);
      if (voices.size === 0) activeEffectsRef.current.delete(name);
      releaseAudio(sound);
    };
    sound.addEventListener("ended", cleanup, { once: true });
    sound.addEventListener("error", cleanup, { once: true });
    sound.play().catch(cleanup);
  }, [effectsEnabled, effectsVolume, playPooledScore, settingsHydrated]);

  const playScoreTick = useCallback((progressionStep: number, options: ScoreTickOptions = {}) => {
    legacyScoreTokenRef.current += 1;
    playPooledScore(
      `score-tick-${legacyScoreTokenRef.current}`,
      progressionStep,
      options,
    );
  }, [playPooledScore]);

  useEffect(() => () => {
    stopEffects();
    scorePoolRef.current?.dispose();
    scorePoolRef.current = null;
  }, [stopEffects]);

  return {
    musicEnabled,
    effectsEnabled,
    musicVolume,
    effectsVolume,
    setMusicVolume: updateMusicVolume,
    setEffectsVolume: updateEffectsVolume,
    toggleMusic,
    toggleEffects,
    playEffect,
    playScoreTick,
    playScoreEvent,
    prepareScoreSequence,
    stopEffects,
  };
}
