"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLocalSetting, setLocalSetting } from "../lib/offline";

export type AudioScene = "menu" | "run" | "boss";
export type SoundEffect = "card-select" | "card-play" | "score" | "buy" | "uno" | "win" | "lose";

export function useGameAudio(scene: AudioScene) {
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const [musicVolume, setMusicVolume] = useState(0.35);
  const [effectsVolume, setEffectsVolume] = useState(0.65);
  const trackRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    Promise.all([
      getLocalSetting("musicEnabled", false),
      getLocalSetting("effectsEnabled", true),
      getLocalSetting("musicVolume", 0.35),
      getLocalSetting("effectsVolume", 0.65),
    ]).then(([music, effects, musicLevel, effectsLevel]) => {
      setMusicEnabled(music);
      setEffectsEnabled(effects);
      setMusicVolume(musicLevel);
      setEffectsVolume(effectsLevel);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    trackRef.current?.pause();
    const track = new Audio(`/audio/bgm-${scene}.mp3`);
    track.loop = true;
    track.volume = musicVolume;
    track.preload = "none";
    trackRef.current = track;
    if (musicEnabled) track.play().catch(() => undefined);
    return () => track.pause();
  }, [scene, musicEnabled, musicVolume]);

  useEffect(() => {
    if (trackRef.current) trackRef.current.volume = musicVolume;
    setLocalSetting("musicVolume", musicVolume).catch(() => undefined);
  }, [musicVolume]);

  useEffect(() => {
    setLocalSetting("effectsVolume", effectsVolume).catch(() => undefined);
  }, [effectsVolume]);

  const toggleMusic = useCallback(() => {
    setMusicEnabled((enabled) => {
      const next = !enabled;
      setLocalSetting("musicEnabled", next).catch(() => undefined);
      if (next) trackRef.current?.play().catch(() => undefined);
      else trackRef.current?.pause();
      return next;
    });
  }, []);

  const toggleEffects = useCallback(() => {
    setEffectsEnabled((enabled) => {
      const next = !enabled;
      setLocalSetting("effectsEnabled", next).catch(() => undefined);
      return next;
    });
  }, []);

  const playEffect = useCallback((name: SoundEffect) => {
    if (!effectsEnabled) return;
    const sound = new Audio(`/audio/${name}.mp3`);
    sound.volume = effectsVolume;
    sound.play().catch(() => undefined);
  }, [effectsEnabled, effectsVolume]);

  return {
    musicEnabled,
    effectsEnabled,
    musicVolume,
    effectsVolume,
    setMusicVolume,
    setEffectsVolume,
    toggleMusic,
    toggleEffects,
    playEffect,
  };
}
