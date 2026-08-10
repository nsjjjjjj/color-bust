"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLocalSetting, setLocalSetting } from "../lib/offline";

export type AudioScene = "menu" | "run" | "shop" | "boss" | "silent";
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

export const AUDIO_TRACKS = {
  menu: { src: "/audio/bgm-menu.m4a", gain: 0.82 },
  run: null,
  shop: { src: "/audio/bgm-shop.mp3", gain: 0.76 },
  boss: { src: "/audio/bgm-boss.m4a", gain: 0.9 },
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

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function releaseAudio(audio: HTMLAudioElement): void {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

export function useGameAudio(scene: AudioScene) {
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const [musicVolume, setMusicVolume] = useState(0.35);
  const [effectsVolume, setEffectsVolume] = useState(0.65);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const trackRef = useRef<HTMLAudioElement | null>(null);
  const scoreVoiceRef = useRef<HTMLAudioElement | null>(null);
  const activeEffectsRef = useRef(new Set<HTMLAudioElement>());
  const changesBeforeHydrationRef = useRef(new Set<AudioSetting>());

  const markChangedBeforeHydration = useCallback((setting: AudioSetting) => {
    if (!settingsHydrated) changesBeforeHydrationRef.current.add(setting);
  }, [settingsHydrated]);

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
    const previousTrack = trackRef.current;
    if (previousTrack) releaseAudio(previousTrack);
    trackRef.current = null;

    const definition = AUDIO_TRACKS[scene];
    if (!definition) return;

    const track = new Audio(definition.src);
    track.loop = true;
    track.preload = "auto";
    // The volume effect below runs before playback. Starting at zero also avoids
    // a full-volume frame while an asynchronously loaded preference is applied.
    track.volume = 0;
    trackRef.current = track;

    return () => {
      if (trackRef.current === track) trackRef.current = null;
      releaseAudio(track);
    };
  }, [scene]);

  useEffect(() => {
    const track = trackRef.current;
    const definition = AUDIO_TRACKS[scene];
    if (!track || !definition) return;
    track.volume = clampVolume(musicVolume * definition.gain);
  }, [musicVolume, scene]);

  useEffect(() => {
    if (!settingsHydrated) return;
    const track = trackRef.current;
    if (musicEnabled) track?.play().catch(() => undefined);
    else track?.pause();
  }, [musicEnabled, scene, settingsHydrated]);

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
      const track = trackRef.current;
      if (!track || !track.paused) {
        removeResumeListeners();
        return;
      }
      track.play().then(removeResumeListeners).catch(() => undefined);
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
    // Keep this inside the click handler so Safari treats enabling music as a
    // user-initiated play request instead of blocking the following effect.
    if (next) trackRef.current?.play().catch(() => undefined);
    else trackRef.current?.pause();
  }, [markChangedBeforeHydration, musicEnabled]);

  const toggleEffects = useCallback(() => {
    markChangedBeforeHydration("effectsEnabled");
    setEffectsEnabled((enabled) => !enabled);
  }, [markChangedBeforeHydration]);

  const updateMusicVolume = useCallback((value: number) => {
    markChangedBeforeHydration("musicVolume");
    setMusicVolume(clampVolume(value));
  }, [markChangedBeforeHydration]);

  const updateEffectsVolume = useCallback((value: number) => {
    markChangedBeforeHydration("effectsVolume");
    setEffectsVolume(clampVolume(value));
  }, [markChangedBeforeHydration]);

  const playEffect = useCallback((name: SoundEffect) => {
    if (!settingsHydrated || !effectsEnabled) return;
    const definition: AudioAsset | null = AUDIO_EFFECTS[name];
    if (!definition) return;

    if (name === "score") {
      const scoreVoice = scoreVoiceRef.current ?? new Audio(definition.src);
      scoreVoiceRef.current = scoreVoice;
      scoreVoice.preload = "auto";
      scoreVoice.pause();
      scoreVoice.currentTime = 0;
      scoreVoice.volume = clampVolume(effectsVolume * definition.gain);
      scoreVoice.playbackRate = definition.playbackRate ?? 1;
      scoreVoice.play().catch(() => undefined);
      return;
    }

    const sound = new Audio(definition.src);
    sound.preload = "auto";
    sound.volume = clampVolume(effectsVolume * definition.gain);
    sound.playbackRate = definition.playbackRate ?? 1;
    activeEffectsRef.current.add(sound);
    let released = false;
    const cleanup = () => {
      if (released) return;
      released = true;
      sound.removeEventListener("ended", cleanup);
      sound.removeEventListener("error", cleanup);
      activeEffectsRef.current.delete(sound);
      releaseAudio(sound);
    };
    sound.addEventListener("ended", cleanup, { once: true });
    sound.addEventListener("error", cleanup, { once: true });
    sound.play().catch(cleanup);
  }, [effectsEnabled, effectsVolume, settingsHydrated]);

  useEffect(() => () => {
    const track = trackRef.current;
    trackRef.current = null;
    if (track) releaseAudio(track);

    const scoreVoice = scoreVoiceRef.current;
    scoreVoiceRef.current = null;
    if (scoreVoice) releaseAudio(scoreVoice);

    for (const sound of activeEffectsRef.current) releaseAudio(sound);
    activeEffectsRef.current.clear();
  }, []);

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
  };
}
