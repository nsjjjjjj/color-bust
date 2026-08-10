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

export const AUDIO_TRACKS = {
  menu: { src: "/audio/bgm-menu.m4a", gain: 0.82 },
  run: { src: "/audio/bgm-run.m4a", gain: 0.74 },
  shop: { src: "/audio/bgm-shop.mp3", gain: 0.76 },
  boss: { src: "/audio/bgm-boss.mp3", gain: 0.86 },
  "final-boss": { src: "/audio/bgm-final-boss.mp3", gain: 0.92 },
  silent: null,
} as const satisfies Readonly<Record<AudioScene, AudioAsset | null>>;

export const AUDIO_EFFECTS = {
  "card-select": null,
  "card-play": { src: "/audio/card-play.mp3", gain: 0.82 },
  "card-draw": { src: "/audio/card-draw.mp3", gain: 0.68 },
  "deck-setup": { src: "/audio/deck-setup.mp3", gain: 0.82 },
  score: { src: "/audio/score.mp3", gain: 0.58 },
  buy: null,
  uno: null,
  win: null,
  lose: null,
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
  const effectGainsRef = useRef(new WeakMap<HTMLAudioElement, number>());
  const scoreSequenceRef = useRef({ lastPlayedAt: 0, step: -1 });
  const changesBeforeHydrationRef = useRef(new Set<AudioSetting>());

  const markChangedBeforeHydration = useCallback((setting: AudioSetting) => {
    if (!settingsHydrated) changesBeforeHydrationRef.current.add(setting);
  }, [settingsHydrated]);

  const stopEffects = useCallback(() => {
    for (const voices of activeEffectsRef.current.values()) {
      for (const sound of voices) releaseAudio(sound);
    }
    activeEffectsRef.current.clear();
    effectGainsRef.current = new WeakMap<HTMLAudioElement, number>();
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
    if (!effectsEnabled) {
      stopEffects();
      return;
    }
    for (const voices of activeEffectsRef.current.values()) {
      for (const sound of voices) {
        sound.volume = clampVolume(effectsVolume * (effectGainsRef.current.get(sound) ?? 1));
      }
    }
  }, [effectsEnabled, effectsVolume, stopEffects]);

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

    const fallbackVoiceLimit = name === "score"
      ? DEFAULT_SCORE_TICK_VOICE_LIMIT
      : DEFAULT_EFFECT_VOICE_LIMIT;
    const voiceLimit = clampVoiceLimit(options.maxVoices, fallbackVoiceLimit);
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
        options.semitonesPerStep ?? (name === "score" ? DEFAULT_SCORE_TICK_SEMITONES : 0),
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
  }, [effectsEnabled, effectsVolume, settingsHydrated]);

  const playScoreTick = useCallback((progressionStep: number, options: ScoreTickOptions = {}) => {
    playEffect("score", {
      progressionStep,
      semitonesPerStep: options.semitonesPerStep ?? DEFAULT_SCORE_TICK_SEMITONES,
      semitoneOffset: options.semitoneOffset,
      gain: options.gain,
      maxVoices: options.maxVoices ?? DEFAULT_SCORE_TICK_VOICE_LIMIT,
    });
  }, [playEffect]);

  useEffect(() => stopEffects, [stopEffects]);

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
    stopEffects,
  };
}
