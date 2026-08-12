"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  buyDeckWork,
  buyShopOffer,
  claimRoundReward,
  createRun,
  discardCards,
  nextRound,
  playHand,
  previewHand,
  rerollShop,
  sellJoker,
  sellStashedItem,
  setHotSwapColor,
  takePackChoices,
  useStashedHandUpgrade as applyStashedHandUpgrade,
  useStashedItem as applyStashedItem,
} from "../lib/game/engine";
import {
  CARD_COLORS,
  DEFAULT_COMMUNITY_UNO_CARDS,
  HAND_RULES,
  JOKER_CATALOG,
  ROUND_ORDER,
  UNO_MODULE_CATALOG,
} from "../lib/game/constants";
import { COLOR_IDENTITIES } from "../lib/game/colors";
import { PROTOCOL_CONFIG } from "../lib/game/garage-config";
import { buildScoreEvents, type ScoreEvent } from "../lib/game/score-events";
import { validateCommunityUnoCard } from "../lib/game/uno";
import type {
  CardColor,
  CommunityUnoCard as EngineUnoCard,
  GameCard,
  RunState,
  ScoreBreakdown,
  UnoModuleId,
  UnoNegativeModuleId,
  UnoPositiveModuleId,
} from "../lib/game/types";
import type {
  CloudRun,
  CommunityUnoCard,
  UpsertRunResponse,
  UserProfile,
} from "../lib/server/contracts";
import {
  flushSyncQueue,
  getLocalSetting,
  listLocalRuns,
  pruneLocalRuns,
  saveLocalRun,
  setLocalSetting,
  subscribeConnectivity,
} from "../lib/offline";
import {
  orderHandWithSort,
  sortHandOnce,
  type HandSort,
} from "../lib/ui/hand-order";
import { CommunityHub } from "./components/community-hub";
import { DeckInspector, HandGuide } from "./components/game-reference";
import { GarageView } from "./components/garage-view";
import { GameRunLayout, type RunLayoutPhase } from "./components/game-run-layout";
import { GameSelectScreen } from "./components/game-select-screen";
import { HandView, PlayedCardsView } from "./components/hand-view";
import { Lobby, type RunSummary } from "./components/lobby";
import { Modal } from "./components/modal";
import { ModifierRail } from "./components/modifier-rail";
import { RoundRewardView } from "./components/round-reward-view";
import { GuestbookView, LeaderboardView } from "./components/social-views";
import { audioSceneForBossAnte, useGameAudio, type AudioScene } from "./use-game-audio";

type View = "lobby" | "game-select" | "game" | "community" | "leaderboard" | "guestbook";
type UtilityModal = "run-info" | "hands" | "deck" | null;
type HandOrderState = {
  readonly scope: string;
  readonly ids: readonly string[];
  /** The last explicit sort command. New draws follow this while it is set. */
  readonly activeSort: HandSort | null;
};
type InitialUser = Pick<UserProfile, "displayName" | "email"> & { userId?: string };
type SyncConflict = {
  local: RunState;
  remote: RunState;
  remoteRevision: number;
  remoteUpdatedAt: string;
};
type ScorePlayback = {
  readonly key: number;
  readonly breakdown: ScoreBreakdown;
  readonly cards: readonly GameCard[];
  readonly handBefore: readonly GameCard[];
  readonly drawPileBefore: readonly GameCard[];
  readonly discardPileBefore: readonly GameCard[];
  readonly events: readonly ScoreEvent[];
  readonly roundScoreBefore: number;
  readonly eventIndex: number;
  readonly phase: "moving" | "scoring" | "transferring" | "discarding";
};
type DiscardPlayback = {
  readonly key: number;
  readonly sourceRunId: string;
  readonly sourceActionCount: number;
  readonly cardIds: readonly string[];
  readonly discardedCount: number;
  readonly nextState: RunState;
};

const BASE_HAND_LEVELS = Object.fromEntries(
  Object.keys(HAND_RULES).map((handType) => [handType, 1]),
) as RunState["handLevels"];

const ROUND_LABEL: Record<RunState["round"], string> = {
  small: "WARM-UP",
  big: "BREAKPOINT",
  boss: "MAYHEM ROUND",
};

function isRunState(value: unknown): value is RunState {
  if (!value || typeof value !== "object") return false;
  const run = value as Partial<RunState>;
  return run.version === 1 && typeof run.runId === "string" && Array.isArray(run.hand) && typeof run.phase === "string";
}

function serverCardToEngine(card: CommunityUnoCard): EngineUnoCard | null {
  const positives: UnoPositiveModuleId[] = [];
  const negatives: UnoNegativeModuleId[] = [];
  for (const id of card.moduleIds) {
    const definition = UNO_MODULE_CATALOG[id as UnoModuleId];
    if (!definition) continue;
    if (definition.kind === "positive") positives.push(id as UnoPositiveModuleId);
    else negatives.push(id as UnoNegativeModuleId);
  }
  const converted: EngineUnoCard = {
    id: card.id,
    name: card.name,
    author: card.creatorName,
    version: card.version,
    positiveModules: positives,
    negativeModules: negatives,
  };
  return validateCommunityUnoCard(converted).valid ? converted : null;
}

function runStatus(run: RunState): "active" | "won" | "lost" {
  if (run.phase === "won") return "won";
  if (run.phase === "lost") return "lost";
  return "active";
}

function resolvedBreakdownValues(breakdown: ScoreBreakdown) {
  const power = breakdown.chipsBeforeUno + (breakdown.uno?.chipDelta ?? 0);
  const hype = (breakdown.multiplierBeforeUno + (breakdown.uno?.multiplierDelta ?? 0))
    * breakdown.jokerXMultiplier
    * (breakdown.uno?.xMultiplier ?? 1);
  return { power, hype };
}

function scoreCountUpDuration(event: ScoreEvent, scoreDelta: number): number {
  const magnitude = Math.abs(scoreDelta);
  const byMagnitude = magnitude <= 75
    ? 100
    : magnitude <= 350
      ? 160
      : magnitude <= 1_500
        ? 240
        : magnitude <= 6_000
          ? 320
          : 400;
  if (event.emphasis === "final") return Math.max(280, byMagnitude);
  if (event.emphasis === "strong") return Math.max(240, byMagnitude);
  return byMagnitude;
}

function scoreEventPlaybackDelay(
  event: ScoreEvent | undefined,
  previousTotal: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return 70;
  if (!event) return 220;
  const baseHold = event.emphasis === "final"
    ? 520
    : event.emphasis === "strong"
      ? 390
      : event.emphasis === "subtle"
        ? 150
        : 240;
  const hold = event.type === "card-score"
    ? Math.max(290, baseHold)
    : event.sourceCardId
      ? Math.max(210, baseHold)
      : baseHold;
  return Math.max(hold, scoreCountUpDuration(event, event.currentTotal - previousTotal) + 50);
}

function scoreTransferDuration(total: number): number {
  const magnitude = Math.abs(total);
  if (magnitude <= 250) return 520;
  if (magnitude <= 1_500) return 650;
  if (magnitude <= 8_000) return 780;
  return 900;
}

export function GameApp({ initialUser }: { initialUser: InitialUser | null }) {
  const appShellRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>("lobby");
  const [run, setRun] = useState<RunState | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedUnoId, setSelectedUnoId] = useState<string | null>(null);
  const [calledColor, setCalledColor] = useState<CardColor>("red");
  const [lastBreakdown, setLastBreakdown] = useState<ScoreBreakdown | null>(null);
  const [equippedUno, setEquippedUno] = useState<CommunityUnoCard | undefined>();
  const [online, setOnline] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [utilityModal, setUtilityModal] = useState<UtilityModal>(null);
  const [handOrder, setHandOrder] = useState<HandOrderState>({ scope: "", ids: [], activeSort: null });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pendingSellId, setPendingSellId] = useState<string | null>(null);
  const [pendingStartMode, setPendingStartMode] = useState<"standard" | "endless" | null>(null);
  const [pendingContinue, setPendingContinue] = useState(false);
  const [pendingLobbyExit, setPendingLobbyExit] = useState(false);
  const [syncConflict, setSyncConflict] = useState<SyncConflict | null>(null);
  const [scorePlayback, setScorePlayback] = useState<ScorePlayback | null>(null);
  const [discardPlayback, setDiscardPlayback] = useState<DiscardPlayback | null>(null);
  const [displayRoundScore, setDisplayRoundScore] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenPromptDismissed, setFullscreenPromptDismissed] = useState(false);
  const [notice, setNotice] = useState("");
  const [loadingSave, setLoadingSave] = useState(true);
  const [cashOutLeaving, setCashOutLeaving] = useState(false);
  const cloudRevision = useRef<Record<"standard" | "endless", number>>({ standard: 0, endless: 0 });
  const latestRunRef = useRef<RunState | null>(null);
  const lastScoreSoundEventRef = useRef<string | null>(null);
  const lastResultSoundRef = useRef<string | null>(null);
  const lastRewardSoundRef = useRef<string | null>(null);
  const scoreCountUpFrameRef = useRef<number | null>(null);
  const cashOutTimerRef = useRef<number | null>(null);
  const displayRoundScoreRef = useRef(0);

  const replaceRun = useCallback((state: RunState) => {
    if (cashOutTimerRef.current !== null) {
      window.clearTimeout(cashOutTimerRef.current);
      cashOutTimerRef.current = null;
    }
    setCashOutLeaving(false);
    setRun(state);
    setSelectedIds([]);
    setSelectedUnoId(null);
    setLastBreakdown(null);
    setScorePlayback(null);
    setDiscardPlayback(null);
    setHandOrder({
      scope: `${state.runId}:${state.roundNumber}`,
      ids: state.hand.map((card) => card.id),
      activeSort: null,
    });
    displayRoundScoreRef.current = state.score;
    setDisplayRoundScore(state.score);
  }, []);

  const audioScene: AudioScene = view !== "game" || !run
    ? "menu"
    : scorePlayback
      ? run.round === "boss" ? audioSceneForBossAnte(run.ante) : "run"
      : run.phase === "shop"
        ? "shop"
        : run.phase === "won" || run.phase === "lost"
          ? "silent"
          : run.round === "boss" ? audioSceneForBossAnte(run.ante) : "run";
  const audio = useGameAudio(audioScene);
  const playEffect = audio.playEffect;
  const playScoreEvent = audio.playScoreEvent;
  const prepareScoreSequence = audio.prepareScoreSequence;
  const signedIn = Boolean(initialUser);
  const currentScoreSoundEvent = scorePlayback?.phase === "scoring"
    ? scorePlayback.events[scorePlayback.eventIndex]
    : null;
  const scoreAnimationTarget = scorePlayback
    ? scorePlayback.roundScoreBefore + (
      scorePlayback.phase === "transferring" || scorePlayback.phase === "discarding"
        ? scorePlayback.breakdown.total
        : 0
    )
    : run?.score ?? 0;
  const scoreAnimationActive = scorePlayback?.phase === "transferring";
  useEffect(() => {
    if (!run || scorePlayback || (run.phase !== "won" && run.phase !== "lost")) return;
    const resultKey = `${run.runId}:${run.phase}`;
    if (lastResultSoundRef.current === resultKey) return;
    lastResultSoundRef.current = resultKey;
    playEffect(run.phase === "won" ? "win" : "lose", { maxVoices: 1 });
  }, [playEffect, run, scorePlayback]);

  useEffect(() => {
    if (!run || scorePlayback || run.phase !== "reward") return;
    const rewardKey = `${run.runId}:${run.roundNumber}:${run.pendingReward?.total ?? 0}`;
    if (lastRewardSoundRef.current === rewardKey) return;
    lastRewardSoundRef.current = rewardKey;
    playEffect("round-clear", { maxVoices: 1 });
  }, [playEffect, run, scorePlayback]);

  useLayoutEffect(() => {
    if (scoreCountUpFrameRef.current !== null) {
      window.cancelAnimationFrame(scoreCountUpFrameRef.current);
      scoreCountUpFrameRef.current = null;
    }

    const startScore = displayRoundScoreRef.current;
    if (!scoreAnimationActive || reducedMotion || startScore === scoreAnimationTarget) {
      displayRoundScoreRef.current = scoreAnimationTarget;
      setDisplayRoundScore(scoreAnimationTarget);
      return;
    }

    const duration = scoreTransferDuration(scorePlayback?.breakdown.total ?? 0);
    let startedAt: number | null = null;
    const animate = (now: number) => {
      startedAt ??= now;
      const progress = Math.min(1, (now - startedAt) / duration);
      const easedProgress = 1 - (1 - progress) ** 3;
      const nextScore = progress === 1
        ? scoreAnimationTarget
        : Math.round(startScore + (scoreAnimationTarget - startScore) * easedProgress);
      if (displayRoundScoreRef.current !== nextScore) {
        displayRoundScoreRef.current = nextScore;
        setDisplayRoundScore(nextScore);
      }
      if (progress < 1) {
        scoreCountUpFrameRef.current = window.requestAnimationFrame(animate);
      } else {
        scoreCountUpFrameRef.current = null;
      }
    };
    scoreCountUpFrameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (scoreCountUpFrameRef.current !== null) {
        window.cancelAnimationFrame(scoreCountUpFrameRef.current);
        scoreCountUpFrameRef.current = null;
      }
    };
  }, [reducedMotion, scoreAnimationActive, scoreAnimationTarget, scorePlayback?.breakdown.total]);

  useEffect(() => {
    latestRunRef.current = run;
  }, [run]);

  useEffect(() => () => {
    if (cashOutTimerRef.current !== null) {
      window.clearTimeout(cashOutTimerRef.current);
      cashOutTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const [localRuns, savedUno, savedMotion] = await Promise.all([
        listLocalRuns<RunState>().catch(() => []),
        getLocalSetting<CommunityUnoCard | undefined>("equippedCommunityUno", undefined).catch(() => undefined),
        getLocalSetting<boolean>("reducedMotion", false).catch(() => false),
      ]);
      if (cancelled) return;
      setEquippedUno(savedUno);
      setReducedMotion(savedMotion);
      const local = localRuns.find((record) => isRunState(record.data) && record.data.phase !== "won" && record.data.phase !== "lost");
      if (local) replaceRun(local.data);

      if (signedIn && navigator.onLine) {
        const remoteRuns = await Promise.all(["standard", "endless"].map(async (mode) => {
          try {
            const response = await fetch(`/api/runs/${mode}`, { credentials: "include" });
            if (!response.ok) return null;
            const data = (await response.json()) as { run: CloudRun | null };
            if (data.run) cloudRevision.current[data.run.mode] = data.run.revision;
            return data.run;
          } catch {
            return null;
          }
        }));
        const latestRemote = remoteRuns.filter(Boolean).sort((a, b) => Date.parse(b!.updatedAt) - Date.parse(a!.updatedAt))[0];
        const localUpdated = local?.updatedAt ?? 0;
        if (latestRemote && Date.parse(latestRemote.updatedAt) > localUpdated && isRunState(latestRemote.snapshot)) {
          replaceRun(latestRemote.snapshot);
          setNotice("다른 기기의 최신 진행을 불러왔습니다.");
        }
      }
      setLoadingSave(false);
    }
    restore();
    return () => { cancelled = true; };
  }, [replaceRun, signedIn]);

  const syncCloudRun = useCallback(async (state: RunState): Promise<number> => {
    if (!signedIn || !navigator.onLine) return cloudRevision.current[state.mode];
    const send = async (expectedRevision: number) => fetch(`/api/runs/${state.mode}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedRevision,
        operationId: crypto.randomUUID(),
        snapshot: state,
        score: state.stats.totalScore,
        ante: state.ante,
        status: runStatus(state),
        rulesetVersion: state.version,
      }),
    });

    const response = await send(cloudRevision.current[state.mode]);
    if (response.status === 409) {
      const latest = await fetch(`/api/runs/${state.mode}`, { credentials: "include" }).then((value) => value.json()).catch(() => null) as { run?: CloudRun } | null;
      if (latest?.run && isRunState(latest.run.snapshot)) {
        cloudRevision.current[state.mode] = latest.run.revision;
        setSyncConflict({
          local: state,
          remote: latest.run.snapshot,
          remoteRevision: latest.run.revision,
          remoteUpdatedAt: latest.run.updatedAt,
        });
        throw new Error("다른 기기의 최신 진행과 충돌했습니다.");
      }
    }
    if (!response.ok) throw new Error("클라우드 저장에 실패했습니다.");
    const data = (await response.json()) as UpsertRunResponse;
    cloudRevision.current[state.mode] = data.run.revision;
    return data.run.revision;
  }, [signedIn]);

  useEffect(() => {
    if (!run) return;
    const timer = window.setTimeout(() => {
      saveLocalRun({ id: run.runId, revision: run.actionLog.length, updatedAt: Date.now(), data: run }).catch(() => undefined);
      if (signedIn && navigator.onLine) {
        syncCloudRun(run).then(() => setNotice("클라우드에 저장됨")).catch(() => setNotice("기기에 저장됨 · 연결되면 다시 동기화합니다"));
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [run, signedIn, syncCloudRun]);

  useEffect(() => subscribeConnectivity((connected) => {
    setOnline(connected);
    if (connected) {
      flushSyncQueue().catch(() => undefined);
      if (latestRunRef.current && signedIn) syncCloudRun(latestRunRef.current).catch(() => undefined);
    }
  }), [signedIn, syncCloudRun]);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(Boolean(document.fullscreenElement));
    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenEnabled || !appShellRef.current) {
      setNotice("이 브라우저에서는 전체화면을 사용할 수 없습니다.");
      return;
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await appShellRef.current.requestFullscreen();
    } catch {
      setNotice("전체화면 전환에 실패했습니다. 브라우저 권한을 확인해 주세요.");
    }
  }, []);

  const dismissFullscreenPrompt = useCallback(() => {
    setFullscreenPromptDismissed(true);
  }, []);

  const shouldOfferFullscreen = view === "game"
    && Boolean(run)
    && !isFullscreen
    && !fullscreenPromptDismissed
    && typeof document !== "undefined"
    && document.fullscreenEnabled
    && window.innerWidth >= 1001;

  useEffect(() => {
    if (!scorePlayback) return;
    if (scorePlayback.phase === "moving") {
      const movementTimer = window.setTimeout(
        () => {
          setScorePlayback((current) => {
            if (!current || current.key !== scorePlayback.key || current.phase !== "moving") {
              return current;
            }
            return { ...current, phase: "scoring" };
          });
        },
        reducedMotion ? 60 : 260,
      );
      return () => window.clearTimeout(movementTimer);
    }
    if (scorePlayback.phase === "transferring") {
      const transferTimer = window.setTimeout(
        () => {
          setScorePlayback((current) => {
            if (!current || current.key !== scorePlayback.key || current.phase !== "transferring") {
              return current;
            }
            return { ...current, phase: "discarding" };
          });
        },
        reducedMotion ? 80 : scoreTransferDuration(scorePlayback.breakdown.total) + 80,
      );
      return () => window.clearTimeout(transferTimer);
    }
    if (scorePlayback.phase === "discarding") {
      const discardTimer = window.setTimeout(
        () => {
          if (run?.phase === "playing") playEffect("card-draw");
          setNotice(scorePlayback.breakdown.roundReward > 0
            ? `TARGET CLEAR · ${scorePlayback.breakdown.roundReward}¢ 정산 준비`
            : `${scorePlayback.breakdown.handName} ${scorePlayback.breakdown.total.toLocaleString()}점`);
          setScorePlayback(null);
        },
        reducedMotion ? 80 : 430,
      );
      return () => window.clearTimeout(discardTimer);
    }

    const event = scorePlayback.events[scorePlayback.eventIndex];
    const previousTotal = scorePlayback.eventIndex > 0
      ? scorePlayback.events[scorePlayback.eventIndex - 1]?.currentTotal ?? 0
      : 0;
    const delay = scoreEventPlaybackDelay(event, previousTotal, reducedMotion);
    const timer = window.setTimeout(() => {
      setScorePlayback((current) => {
        if (!current || current.key !== scorePlayback.key) return current;
        if (current.eventIndex < current.events.length - 1) {
          return { ...current, eventIndex: current.eventIndex + 1 };
        }
        return { ...current, phase: "transferring" };
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playEffect, reducedMotion, run?.phase, scorePlayback]);

  useEffect(() => {
    if (!discardPlayback) return;
    const timer = window.setTimeout(() => {
      const activeRun = latestRunRef.current;
      if (!activeRun
        || activeRun.runId !== discardPlayback.sourceRunId
        || activeRun.actionLog.length !== discardPlayback.sourceActionCount) {
        setDiscardPlayback(null);
        return;
      }
      setRun(discardPlayback.nextState);
      setSelectedIds([]);
      setNotice(`${discardPlayback.discardedCount}장 버림 · 이번 라운드에는 다시 나오지 않습니다.`);
      setDiscardPlayback(null);
      playEffect("card-draw");
    }, reducedMotion ? 70 : 240);
    return () => window.clearTimeout(timer);
  }, [discardPlayback, playEffect, reducedMotion]);

  useLayoutEffect(() => {
    if (!scorePlayback || !currentScoreSoundEvent) {
      lastScoreSoundEventRef.current = null;
      return;
    }
    const soundEventKey = `${scorePlayback.key}:${currentScoreSoundEvent.id}`;
    if (lastScoreSoundEventRef.current === soundEventKey) return;
    lastScoreSoundEventRef.current = soundEventKey;

    const anchoredEvents = scorePlayback.events.filter((event) => event.sourceCardId);
    const eventStep = anchoredEvents.findIndex((event) => event.id === currentScoreSoundEvent.id);
    const progressionStep = eventStep >= 0 ? eventStep : scorePlayback.eventIndex;
    // Only cards that contribute their own rank score advance the rising note.
    // MOD and enhancement beats keep their separate sounds without skipping a pitch.
    const scoringCardEvents = scorePlayback.events.filter((event) => event.type === "card-score");
    const scoringCardStep = scoringCardEvents.findIndex((event) => event.id === currentScoreSoundEvent.id);

    if (currentScoreSoundEvent.sourceKind === "mayhem") {
      playEffect("mayhem-arm", {
        progressionStep,
        semitonesPerStep: 0.35,
        gain: currentScoreSoundEvent.emphasis === "strong" ? 1.05 : 0.78,
      });
      return;
    }
    if (currentScoreSoundEvent.sourceKind === "mod") {
      playEffect(
        currentScoreSoundEvent.operation === "multiply-score" ? "multiplier" : "mod-trigger",
        { progressionStep, semitonesPerStep: 0.5, gain: currentScoreSoundEvent.emphasis === "strong" ? 1 : 0.76 },
      );
      return;
    }
    if (currentScoreSoundEvent.type === "card-effect") {
      playEffect("enhancement", { progressionStep, semitonesPerStep: 0.45 });
      return;
    }
    if (currentScoreSoundEvent.type === "hand-detected") {
      playEffect("ui-open", { gain: 0.7 });
      return;
    }
    if (currentScoreSoundEvent.type === "final-score") {
      playEffect("multiplier", { progressionStep, semitonesPerStep: 0.35, gain: 1.12 });
      return;
    }
    if (currentScoreSoundEvent.type === "card-score" && scoringCardStep >= 0) {
      playScoreEvent(soundEventKey, scoringCardStep, {
        semitonesPerStep: 1.45,
        gain: scoringCardStep === scoringCardEvents.length - 1 ? 1.14 : 1,
      });
      return;
    }
    if (!currentScoreSoundEvent.sourceCardId || eventStep < 0) return;
    const gain = currentScoreSoundEvent.type === "card-score" ? 1 : 0.72;
    playScoreEvent(soundEventKey, eventStep, {
      gain: eventStep === anchoredEvents.length - 1 ? gain * 1.14 : gain,
    });
  }, [currentScoreSoundEvent, playEffect, playScoreEvent, scorePlayback]);

  function updateRun(action: () => RunState): RunState | null {
    try {
      const next = action();
      setRun(next);
      setNotice("");
      return next;
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "행동을 처리할 수 없습니다.");
      audio.playEffect("ui-error", { maxVoices: 1 });
      return null;
    }
  }

  function handleCashOutClaim(rewardRun: RunState) {
    if (cashOutLeaving || rewardRun.phase !== "reward") return;

    setCashOutLeaving(true);
    audio.playEffect("coin", { progressionStep: rewardRun.pendingReward?.total ?? 0, semitonesPerStep: 0.08 });
    cashOutTimerRef.current = window.setTimeout(() => {
      cashOutTimerRef.current = null;
      const current = latestRunRef.current;
      if (!current || current.runId !== rewardRun.runId || current.phase !== "reward") {
        setCashOutLeaving(false);
        return;
      }

      updateRun(() => claimRoundReward(current));
      setCashOutLeaving(false);
    }, reducedMotion ? 60 : 300);
  }

  function handleToggleCard(id: string) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((value) => value !== id));
      audio.playEffect("card-select");
      return;
    }
    if (selectedIds.length >= 5) {
      setNotice("한 번에 최대 5장까지 선택할 수 있습니다.");
      audio.playEffect("ui-error", { maxVoices: 1 });
      return;
    }
    setSelectedIds([...selectedIds, id]);
    setNotice("");
    audio.playEffect("card-select");
  }

  function changeSort(nextSort: HandSort) {
    if (!run || run.phase !== "playing" || scorePlayback || discardPlayback) return;
    const scope = `${run.runId}:${run.roundNumber}`;
    setHandOrder((current) => ({
      scope,
      ids: sortHandOnce(run.hand, current.scope === scope ? current.ids : [], nextSort),
      activeSort: nextSort,
    }));
    audio.playEffect("sort");
  }

  function openLobby() {
    setView("lobby");
    setNotice("");
    setLastBreakdown(null);
    setSelectedIds([]);
    setSelectedUnoId(null);
    setScorePlayback(null);
    setDiscardPlayback(null);
    setHandOrder({ scope: "", ids: [], activeSort: null });
    setCalledColor("red");
    setPendingSellId(null);
    setPendingLobbyExit(false);
    setPendingContinue(false);
    setSettingsOpen(false);
    setAccountOpen(false);
  }


  function startRun(mode: "standard" | "endless") {
    const chosen = equippedUno ? serverCardToEngine(equippedUno) : null;
    const starter = DEFAULT_COMMUNITY_UNO_CARDS[0];
    // 장착한 커뮤니티 카드는 첫 상점의 유일한 미보유 UNO 후보가 되어 확정 등장한다.
    const pool = chosen ? [starter, chosen] : DEFAULT_COMMUNITY_UNO_CARDS;
    const created = createRun({
      seed: crypto.randomUUID(),
      mode,
      startingCoins: 10,
      starterUno: starter,
      communityUnoPool: pool,
    });
    cloudRevision.current[mode] = cloudRevision.current[mode] ?? 0;
    pruneLocalRuns(created.runId).catch(() => undefined);
    setRun(created);
    setSelectedIds([]);
    setLastBreakdown(null);
    setScorePlayback(null);
    setDiscardPlayback(null);
    setSelectedUnoId(null);
    setHandOrder({
      scope: `${created.runId}:${created.roundNumber}`,
      ids: created.hand.map((card) => card.id),
      activeSort: null,
    });
    setView("game");
    audio.playEffect("deck-setup");
    setNotice(mode === "standard" ? "5 STAGE 런을 시작합니다." : "끝없는 신호에 접속했습니다.");
  }

  function requestStartRun(mode: "standard" | "endless") {
    if (run && run.phase !== "won" && run.phase !== "lost") {
      setPendingStartMode(mode);
      return;
    }
    startRun(mode);
  }

  function handlePlay() {
    if (!run || selectedIds.length === 0 || scorePlayback || discardPlayback) return;
    prepareScoreSequence();
    try {
      const playedCards = selectedIds
        .map((id) => run.hand.find((card) => card.id === id))
        .filter((card): card is GameCard => Boolean(card));
      const result = playHand(run, selectedIds, selectedUnoId ? { unoCardId: selectedUnoId, calledColor } : {});
      const scoreEvents = buildScoreEvents(result.breakdown, playedCards);
      setRun(result.state);
      setLastBreakdown(result.breakdown);
      setScorePlayback({
        key: Date.now(),
        breakdown: result.breakdown,
        cards: playedCards,
        handBefore: run.hand,
        drawPileBefore: run.drawPile,
        discardPileBefore: run.discardPile,
        events: scoreEvents,
        roundScoreBefore: run.score,
        eventIndex: 0,
        phase: "moving",
      });
      setSelectedIds([]);
      if (selectedUnoId) audio.playEffect("uno", { maxVoices: 1 });
      audio.playEffect("card-play");
      setSelectedUnoId(null);
      setNotice("카드를 제출했습니다. 점수를 계산합니다.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "핸드를 제출할 수 없습니다.");
      audio.playEffect("ui-error", { maxVoices: 1 });
    }
  }

  function handleDiscard() {
    if (!run || selectedIds.length === 0 || scorePlayback || discardPlayback) return;
    const discardedCount = selectedIds.length;
    try {
      const nextState = discardCards(run, selectedIds);
      setDiscardPlayback({
        key: Date.now(),
        sourceRunId: run.runId,
        sourceActionCount: run.actionLog.length,
        cardIds: [...selectedIds],
        discardedCount,
        nextState,
      });
      setNotice("선택한 카드를 버리는 중입니다.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "카드를 버릴 수 없습니다.");
      audio.playEffect("ui-error", { maxVoices: 1 });
      return;
    }
    audio.playEffect("discard", { progressionStep: Math.max(0, discardedCount - 1), semitonesPerStep: -0.3 });
  }

  async function submitRank() {
    if (!run || !signedIn || !navigator.onLine) {
      setNotice("공식 기록 제출은 로그인과 온라인 연결이 필요합니다.");
      return;
    }
    try {
      const revision = await syncCloudRun(run);
      const response = await fetch("/api/leaderboard", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: run.mode, score: run.stats.totalScore, ante: run.ante, runRevision: revision }),
      });
      if (!response.ok) throw new Error("기록을 검증하지 못했습니다.");
      setNotice("공식 랭킹에 기록을 제출했습니다.");
      setView("leaderboard");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "기록 제출에 실패했습니다.");
    }
  }

  const summary: RunSummary | null = run && run.phase !== "won" && run.phase !== "lost" ? {
    ante: run.ante,
    roundIndex: ROUND_ORDER.indexOf(run.round) + 1,
    roundNumber: run.roundNumber,
    roundLabel: ROUND_LABEL[run.round],
    score: run.score,
    target: run.target,
    coins: run.coins,
    mode: run.mode,
  } : null;

  const sectionLabel: Partial<Record<View, string>> = {
    community: "메이헴 연구소",
    leaderboard: "랭킹",
    guestbook: "평가소",
    game: "런 결과",
  };
  const currentSection = sectionLabel[view];
  const immersiveView = view === "lobby" || view === "game-select"
    || (view === "game" && (!run || run.phase === "playing" || run.phase === "reward" || run.phase === "shop" || Boolean(scorePlayback)));
  const runScenePhase: RunLayoutPhase | null = view === "game" && run
    ? scorePlayback
      ? "playing"
      : run.phase === "playing" || run.phase === "reward" || run.phase === "shop"
        ? run.phase
        : null
    : null;

  return (
    <div
      ref={appShellRef}
      className={`app-shell high-contrast${immersiveView ? " is-immersive" : ""}${reducedMotion ? " reduced-motion" : ""}`}
      onClickCapture={(event) => {
        const target = event.target instanceof Element
          ? event.target.closest<HTMLElement>("button, [role='button']")
          : null;
        if (!target || target.matches(":disabled, [aria-disabled='true']") || target.dataset.sfx === "silent") return;
        audio.playEffect("ui-click", { gain: 0.34, maxVoices: 2 });
      }}
    >
      <header className="topbar">
        <button type="button" className="brand" onClick={openLobby} aria-label="DECK MAYHEM 홈">
          <svg className="brand-mark" viewBox="0 0 512 512" aria-hidden="true">
            <defs>
              <filter id="brand-background-cutout" colorInterpolationFilters="sRGB">
                <feColorMatrix
                  in="SourceGraphic"
                  type="matrix"
                  values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  .38 1.29 .13 0 -.12"
                />
              </filter>
            </defs>
            <image href="/brand/deck-mayhem-mark.png" width="512" height="512" filter="url(#brand-background-cutout)" />
          </svg>
          <b>DECK <span>MAYHEM</span></b>
        </button>
        {currentSection && (
          <nav className="topnav topnav-contextual" aria-label="현재 화면">
            <button type="button" className="nav-button" onClick={openLobby}>← 홈</button>
            <span className="nav-current">{currentSection}</span>
          </nav>
        )}
        {!currentSection && (
          <div className="top-actions">
            <span className={`online-pill${online ? "" : " offline"}`}><i />{online ? "온라인" : "오프라인"}</span>
            <button type="button" className="icon-button" aria-label={audio.musicEnabled ? "음악 끄기" : "음악 켜기"} onClick={audio.toggleMusic}>{audio.musicEnabled ? "♪" : "♩"}</button>
            <button type="button" className="icon-button profile-button" onClick={() => setAccountOpen(true)}><i>{initialUser?.displayName.slice(0, 1) ?? "게"}</i><span>{initialUser?.displayName ?? "게스트"}</span></button>
          </div>
        )}
      </header>

      {view === "lobby" && <Lobby savedRun={summary} equippedUno={equippedUno} signedIn={signedIn} online={online} onPlay={() => setView("game-select")} onOpenCommunity={() => setView("community")} onOpenAccount={() => setAccountOpen(true)} onOpenSettings={() => setSettingsOpen(true)} onOpenLeaderboard={() => setView("leaderboard")} onOpenGuestbook={() => setView("guestbook")} />}
      {view === "game-select" && (
        <GameSelectScreen
          savedRun={summary}
          loading={loadingSave}
          onContinue={() => setPendingContinue(true)}
          onNewGame={() => requestStartRun("standard")}
          onBack={openLobby}
        />
      )}
      {view === "community" && <CommunityHub signedIn={signedIn} equippedId={equippedUno?.id} onEquip={(card) => { setEquippedUno(card); setLocalSetting("equippedCommunityUno", card).catch(() => undefined); setNotice(`${card.name} 카드를 다음 런의 첫 상점에 예약했습니다.`); audio.playEffect("equip", { maxVoices: 1 }); }} />}
      {view === "leaderboard" && <LeaderboardView />}
      {view === "guestbook" && <GuestbookView signedIn={signedIn} />}
      {view === "game" && !run && <GameSelectScreen savedRun={null} loading={loadingSave} onContinue={() => undefined} onNewGame={() => requestStartRun("standard")} onBack={openLobby} />}
      {view === "game" && run && runScenePhase && (
        <GameTable
          run={run}
          phase={runScenePhase}
          sceneContent={runScenePhase === "reward" ? (
            <RoundRewardView
              run={run}
              embedded
              notice={notice}
              claiming={cashOutLeaving}
              reducedMotion={reducedMotion}
              onClaim={() => handleCashOutClaim(run)}
            />
          ) : runScenePhase === "shop" ? (
            <GarageView
              run={run}
              embedded
              notice={notice}
              onBuy={(offer, options) => {
                const nextState = updateRun(() => buyShopOffer(run, offer.id, undefined, options));
                if (nextState) {
                  audio.playEffect("buy");
                  if (offer.kind === "protocol") {
                    setNotice(`${PROTOCOL_CONFIG[offer.protocolId].name} 적용 완료!`);
                  }
                }
                return nextState;
              }}
              onReroll={() => {
                if (updateRun(() => rerollShop(run))) audio.playEffect("reroll", { maxVoices: 1 });
              }}
              onSell={setPendingSellId}
              onSelectDeckTarget={(offer, card) => {
                if (updateRun(() => buyDeckWork(run, offer.id, card.id))) audio.playEffect("buy");
              }}
              onTakePack={(_opening, choiceIds, targetCardId, targetColor) => {
                const nextState = updateRun(() => takePackChoices(run, choiceIds, targetCardId, targetColor));
                if (nextState) audio.playEffect("pack-pick", { progressionStep: Math.max(0, choiceIds.length - 1) });
                return nextState;
              }}
              onPackOpen={() => audio.playEffect("pack-open", { maxVoices: 1 })}
              onPackReveal={(index) => audio.playEffect("pack-reveal", { progressionStep: index, semitonesPerStep: 0.6, maxVoices: 2 })}
              onOpenDeck={() => setUtilityModal("deck")}
              onUseStashedItem={(instanceId, options) => {
                if (updateRun(() => applyStashedItem(run, instanceId, options))) {
                  audio.playEffect("equip", { maxVoices: 1 });
                  setNotice("보관 카드를 성공적으로 사용했습니다.");
                }
              }}
              onSellStashedItem={(instanceId) => {
                if (updateRun(() => sellStashedItem(run, instanceId))) {
                  audio.playEffect("buy", { maxVoices: 1 });
                  setNotice("보관 카드를 판매했습니다.");
                }
              }}
              onNext={() => {
                let nextState: RunState;
                try {
                  nextState = nextRound(run);
                } catch (cause) {
                  setNotice(cause instanceof Error ? cause.message : "다음 라운드를 시작할 수 없습니다.");
                  return;
                }
                if (updateRun(() => nextState)) {
                  audio.playEffect(nextState.round === "boss" ? "boss-alert" : "round-start", { maxVoices: 1 });
                }
                setLastBreakdown(null);
                setSelectedIds([]);
              }}
            />
          ) : null}
          selectedIds={selectedIds}
          selectedUnoId={selectedUnoId}
          calledColor={calledColor}
          lastBreakdown={lastBreakdown}
          scorePlayback={scorePlayback}
          discardPlayback={discardPlayback}
          reducedMotion={reducedMotion}
          displayRoundScore={displayRoundScore}
          notice={notice}
          handOrderIds={handOrder.scope === `${run.runId}:${run.roundNumber}` ? handOrder.ids : []}
          activeHandSort={handOrder.scope === `${run.runId}:${run.roundNumber}` ? handOrder.activeSort : null}
          onToggleCard={handleToggleCard}
          onSelectUno={(id) => { setSelectedUnoId(id); audio.playEffect(id ? "mayhem-arm" : "ui-click", { gain: id ? 0.72 : 0.3, maxVoices: 1 }); }}
          onCallColor={(color) => { setCalledColor(color); audio.playEffect("card-select", { playbackRate: 1.08, gain: 0.64 }); }}
          onUseStashedItem={(instanceId) => {
            const item = run.communityUno.find((candidate) => candidate.id === instanceId);
            const useItem = item && "kind" in item && item.kind === "ghost"
              ? () => applyStashedItem(run, instanceId, { targetCardIds: selectedIds })
              : () => applyStashedHandUpgrade(run, instanceId);
            if (updateRun(useItem)) {
              audio.playEffect("equip", { maxVoices: 1 });
              setNotice(item && "kind" in item && item.kind === "ghost"
                ? "고스트 카드 효과가 적용되었습니다."
                : "족보 레벨이 성공적으로 강화되었습니다.");
            }
          }}
          onSellStashedItem={(instanceId) => {
            if (updateRun(() => sellStashedItem(run, instanceId))) {
              audio.playEffect("buy", { maxVoices: 1 });
              setNotice("보관 카드를 판매했습니다.");
            }
          }}
          onSort={changeSort}
          onOpenRunInfo={() => setUtilityModal("run-info")}
          onOpenDeck={() => setUtilityModal("deck")}
          onOpenSettings={() => setSettingsOpen(true)}
          onPlay={handlePlay}
          onDiscard={handleDiscard}
          onSellJoker={setPendingSellId}
          onHotSwap={(color) => {
            if (scorePlayback || discardPlayback) return;
            if (updateRun(() => setHotSwapColor(run, color))) audio.playEffect("equip", { gain: 0.72 });
          }}
        />
      )}
      {view === "game" && run && !scorePlayback && (run.phase === "won" || run.phase === "lost") && <ResultView run={run} notice={notice} signedIn={signedIn} onRank={submitRank} onRestart={() => startRun(run.mode)} onEndless={() => startRun("endless")} onLobby={openLobby} />}

      {currentSection && (
        <nav className="mobile-nav mobile-nav-contextual" aria-label="현재 화면">
          <button type="button" onClick={openLobby}><b>⌂</b>홈</button>
          <span><b aria-hidden="true">◆</b>{currentSection}</span>
        </nav>
      )}
      {notice && view !== "game" && <div className="global-notice" role="status">{notice}</div>}
      {loadingSave && <div className="loading-save" role="status">저장된 런 확인 중…</div>}
      {accountOpen && <AccountModal user={initialUser} onClose={() => setAccountOpen(false)} />}
      {settingsOpen && <SettingsModal audio={audio} reducedMotion={reducedMotion} inRun={view === "game" && Boolean(run)} onOpenRunInfo={() => { setSettingsOpen(false); setUtilityModal("run-info"); }} onExitRun={() => { setSettingsOpen(false); setPendingLobbyExit(true); }} onReducedMotion={(value) => { setReducedMotion(value); setLocalSetting("reducedMotion", value).catch(() => undefined); }} onClose={() => setSettingsOpen(false)} />}
      {shouldOfferFullscreen && (
        <Modal title="전체화면으로 플레이" onClose={dismissFullscreenPrompt}>
          <div className="confirm-body fullscreen-prompt">
            <p>카드 테이블은 전체화면에서 가장 안정적인 비율로 표시됩니다.</p>
            <small>전체화면은 언제든 Esc 키로 종료할 수 있습니다.</small>
            <div className="confirm-actions">
              <button type="button" className="secondary-button" onClick={dismissFullscreenPrompt}>창 모드로 계속</button>
              <button type="button" className="primary-button" onClick={() => { dismissFullscreenPrompt(); void toggleFullscreen(); }}>전체화면으로 시작</button>
            </div>
          </div>
        </Modal>
      )}
      {utilityModal === "run-info" && run && <RunInfoModal run={run} onOpenHands={() => setUtilityModal("hands")} onOpenDeck={() => setUtilityModal("deck")} onClose={() => setUtilityModal(null)} />}
      {utilityModal === "hands" && <HandGuide handLevels={run?.handLevels ?? BASE_HAND_LEVELS} onClose={() => setUtilityModal(null)} />}
      {utilityModal === "deck" && run && <DeckInspector deck={run.deck} drawPile={run.drawPile} discardPile={run.discardPile} hand={run.hand} onClose={() => setUtilityModal(null)} />}
      {pendingSellId && run && (() => {
        const owned = run.jokers.find((joker) => joker.instanceId === pendingSellId);
        if (!owned) return null;
        const definition = JOKER_CATALOG[owned.jokerId];
        const refund = Math.max(1, Math.floor(definition.price / 2));
        return <Modal title="조커 판매" onClose={() => setPendingSellId(null)}><div className="confirm-body"><div className="confirm-joker"><span>{definition.name.slice(0, 1)}</span><div><b>{definition.name}</b><small>{definition.description}</small></div></div><p>이 조커를 판매하고 <strong>{refund}¢</strong>를 받을까요?</p><div className="confirm-actions"><button type="button" className="secondary-button" onClick={() => setPendingSellId(null)}>취소</button><button type="button" className="primary-button" onClick={() => { if (updateRun(() => sellJoker(run, pendingSellId))) audio.playEffect("sell", { maxVoices: 1 }); setPendingSellId(null); }}>판매 +{refund}¢</button></div></div></Modal>;
      })()}
      {pendingContinue && run && <Modal title="이어서 하기" onClose={() => setPendingContinue(false)}><div className="confirm-body"><p><strong>STAGE {run.ante}-{ROUND_ORDER.indexOf(run.round) + 1}</strong>의 게임을 이어서 하시겠습니까?</p><div className="conflict-card"><span>마지막 진행</span><b>STAGE {run.ante}-{ROUND_ORDER.indexOf(run.round) + 1} · ROUND {run.roundNumber}</b><small>{run.score.toLocaleString()} / {run.target.toLocaleString()} POINT · {run.coins}¢</small></div><div className="confirm-actions"><button type="button" className="secondary-button" onClick={() => setPendingContinue(false)}>취소</button><button type="button" className="primary-button" onClick={() => { setPendingContinue(false); setView("game"); }}>이어서 하기</button></div></div></Modal>}
      {pendingStartMode && run && <Modal title="새 게임" onClose={() => setPendingStartMode(null)}><div className="confirm-body"><p>현재 진행 중인 게임이 초기화됩니다. <strong>새 게임을 시작하시겠습니까?</strong></p><div className="conflict-card"><span>현재 진행</span><b>STAGE {run.ante}-{ROUND_ORDER.indexOf(run.round) + 1} · {ROUND_LABEL[run.round]}</b><small>{run.score.toLocaleString()} / {run.target.toLocaleString()} POINT</small></div><div className="confirm-actions"><button type="button" className="secondary-button" onClick={() => setPendingStartMode(null)}>취소</button><button type="button" className="primary-button" onClick={() => { const mode = pendingStartMode; setPendingStartMode(null); startRun(mode); }}>새 게임 시작</button></div></div></Modal>}
      {pendingLobbyExit && run && <Modal title="홈으로 이동" onClose={() => setPendingLobbyExit(false)}><div className="confirm-body"><p>홈으로 이동하시겠습니까? <strong>현재 게임 진행 상황은 자동으로 저장됩니다.</strong></p><div className="conflict-card"><span>저장될 진행</span><b>STAGE {run.ante}-{ROUND_ORDER.indexOf(run.round) + 1} · {ROUND_LABEL[run.round]}</b><small>{run.score.toLocaleString()} / {run.target.toLocaleString()} POINT</small></div><div className="confirm-actions"><button type="button" className="secondary-button" onClick={() => setPendingLobbyExit(false)}>취소</button><button type="button" className="primary-button" onClick={() => { setPendingLobbyExit(false); openLobby(); }}>저장하고 나가기</button></div></div></Modal>}
      {syncConflict && <Modal title="진행 상황 충돌" onClose={() => setSyncConflict(null)} wide><div className="confirm-body"><p>다른 기기에서 같은 모드의 런이 업데이트되었습니다. 자동으로 덮어쓰지 않고 선택을 기다립니다.</p><div className="conflict-grid"><div className="conflict-card"><span>이 기기</span><b>STAGE {syncConflict.local.ante}-{ROUND_ORDER.indexOf(syncConflict.local.round) + 1} · {ROUND_LABEL[syncConflict.local.round]}</b><small>{syncConflict.local.stats.totalScore.toLocaleString()} 누적점</small></div><div className="conflict-card remote"><span>클라우드 · {new Date(syncConflict.remoteUpdatedAt).toLocaleString("ko-KR")}</span><b>STAGE {syncConflict.remote.ante}-{ROUND_ORDER.indexOf(syncConflict.remote.round) + 1} · {ROUND_LABEL[syncConflict.remote.round]}</b><small>{syncConflict.remote.stats.totalScore.toLocaleString()} 누적점</small></div></div><div className="confirm-actions"><button type="button" className="secondary-button" onClick={() => { const conflict = syncConflict; cloudRevision.current[conflict.remote.mode] = conflict.remoteRevision; replaceRun(conflict.remote); setSyncConflict(null); setNotice("클라우드 진행을 불러왔습니다."); }}>클라우드 불러오기</button><button type="button" className="primary-button" onClick={() => { const conflict = syncConflict; cloudRevision.current[conflict.local.mode] = conflict.remoteRevision; setSyncConflict(null); syncCloudRun(conflict.local).then(() => setNotice("이 기기의 진행으로 클라우드를 갱신했습니다.")).catch((cause) => setNotice(cause instanceof Error ? cause.message : "동기화에 실패했습니다.")); }}>이 기기 진행 유지</button></div></div></Modal>}
    </div>
  );
}

function GameTable({
  run,
  phase,
  sceneContent,
  selectedIds,
  selectedUnoId,
  calledColor,
  lastBreakdown,
  scorePlayback,
  discardPlayback,
  reducedMotion,
  displayRoundScore,
  notice,
  handOrderIds,
  activeHandSort,
  onToggleCard,
  onSelectUno,
  onCallColor,
  onUseStashedItem,
  onSellStashedItem,
  onSort,
  onOpenRunInfo,
  onOpenDeck,
  onOpenSettings,
  onPlay,
  onDiscard,
  onHotSwap,
  onSellJoker,
}: {
  run: RunState;
  phase: RunLayoutPhase;
  sceneContent: ReactNode;
  selectedIds: string[];
  selectedUnoId: string | null;
  calledColor: CardColor;
  lastBreakdown: ScoreBreakdown | null;
  scorePlayback: ScorePlayback | null;
  discardPlayback: DiscardPlayback | null;
  reducedMotion: boolean;
  displayRoundScore: number;
  notice: string;
  handOrderIds: readonly string[];
  activeHandSort: HandSort | null;
  onToggleCard: (id: string) => void;
  onSelectUno: (id: string | null) => void;
  onCallColor: (color: CardColor) => void;
  onUseStashedItem?: (instanceId: string) => void;
  onSellStashedItem?: (instanceId: string) => void;
  onSort: (sort: HandSort) => void;
  onOpenRunInfo: () => void;
  onOpenDeck: () => void;
  onOpenSettings: () => void;
  onPlay: () => void;
  onDiscard: () => void;
  onHotSwap: (color: CardColor) => void;
  onSellJoker: (instanceId: string) => void;
}) {
  const currentScoreEvent = scorePlayback && scorePlayback.phase !== "moving"
    ? scorePlayback.events[scorePlayback.eventIndex] ?? null
    : null;
  const selectedBreakdown = useMemo(() => {
    if (phase !== "playing" || selectedIds.length === 0 || scorePlayback) return null;
    try {
      return previewHand(
        run,
        selectedIds,
        selectedUnoId ? { unoCardId: selectedUnoId, calledColor } : {},
      );
    } catch {
      return null;
    }
  }, [calledColor, phase, run, scorePlayback, selectedIds, selectedUnoId]);
  const selectedHandName = selectedBreakdown?.handName ?? null;
  const shown = phase !== "playing"
    ? null
    : scorePlayback
      ? currentScoreEvent ? scorePlayback.breakdown : null
      : selectedBreakdown ?? lastBreakdown;
  const resolvingScore = Boolean(scorePlayback);
  const inputLocked = phase !== "playing" || resolvingScore || Boolean(discardPlayback);
  const runFrameBusy = resolvingScore || Boolean(discardPlayback);
  const hotSwap = run.jokers.find((joker) => joker.jokerId === "hot-swap");
  const cardsLeftInHand = scorePlayback
    ? scorePlayback.handBefore.filter((card) => !scorePlayback.cards.some((played) => played.id === card.id))
    : run.hand;
  const displayHand = orderHandWithSort(cardsLeftInHand, handOrderIds, activeHandSort);
  const scorePhase = scorePlayback?.phase
    ?? (discardPlayback ? "direct-discard" : selectedHandName ? "selecting" : "idle");
  const displayedDrawPile = scorePlayback?.drawPileBefore ?? run.drawPile;
  const displayedDiscardPile = scorePlayback?.discardPileBefore ?? run.discardPile;
  const referenceHand = scorePlayback?.handBefore ?? run.hand;
  const deckReferenceCards = useMemo(
    () => [...displayedDrawPile, ...displayedDiscardPile, ...referenceHand],
    [displayedDiscardPile, displayedDrawPile, referenceHand],
  );
  const resolvedRailValues = shown ? resolvedBreakdownValues(shown) : { power: 0, hype: 0 };
  const selectedHandBase = selectedBreakdown
    ? { power: selectedBreakdown.baseChips, hype: selectedBreakdown.baseMultiplier }
    : null;
  const railPower = currentScoreEvent
    ? currentScoreEvent.currentChips
    : selectedHandBase?.power ?? resolvedRailValues.power;
  const railHype = currentScoreEvent
    ? currentScoreEvent.currentMultiplier * currentScoreEvent.currentXMultiplier
    : selectedHandBase?.hype ?? resolvedRailValues.hype;
  const previousScoreEvent = scorePlayback && scorePlayback.eventIndex > 0
    ? scorePlayback.events[scorePlayback.eventIndex - 1] ?? null
    : null;
  const previousPower = previousScoreEvent?.currentChips ?? 0;
  const previousHype = previousScoreEvent
    ? previousScoreEvent.currentMultiplier * previousScoreEvent.currentXMultiplier
    : 0;
  const powerChanged = Boolean(currentScoreEvent) && railPower !== previousPower;
  const hypeChanged = Boolean(currentScoreEvent) && railHype !== previousHype;
  const railScorePulse = powerChanged && hypeChanged
    ? "both"
    : powerChanged
      ? "power"
      : hypeChanged
        ? "hype"
        : null;
  const scoreImpactKey = !reducedMotion
    && currentScoreEvent
    && currentScoreEvent.currentTotal > (previousScoreEvent?.currentTotal ?? 0)
    ? currentScoreEvent.id
    : null;
  return (
    <GameRunLayout
      run={run}
      phase={phase}
      notice={notice || (phase === "playing" && selectedIds.length ? `${selectedIds.length}/5 카드 선택됨` : "")}
      displayRoundScore={displayRoundScore}
      power={railPower}
      hype={railHype}
      handName={shown?.handName ?? selectedHandName}
      handLevel={shown?.handLevel ?? selectedBreakdown?.handLevel ?? null}
      scorePulse={railScorePulse}
      scoreEventKey={currentScoreEvent?.id ?? null}
      scoreImpactKey={scoreImpactKey}
      isTransferring={scorePlayback?.phase === "transferring"}
      scorePhase={scorePhase}
      onOpenRunInfo={onOpenRunInfo}
      onOpenSettings={onOpenSettings}
      onOpenDeck={onOpenDeck}
      drawPile={displayedDrawPile}
      referenceCards={deckReferenceCards}
      deckDisabled={runFrameBusy}
      sidebarExtra={phase === "playing" && hotSwap && run.handHistory.length === 0 ? <ColorPicker value={hotSwap.selectedColor ?? "red"} disabled={inputLocked} onChange={onHotSwap} /> : null}
      topCardSlots={(
        <ModifierRail
          run={run}
          breakdown={phase === "playing" ? shown : null}
          scoreEvent={phase === "playing" ? currentScoreEvent : null}
          selectedUnoId={phase === "playing" ? selectedUnoId : null}
          calledColor={calledColor}
          disabled={inputLocked}
          onSelectUno={onSelectUno}
          onCallColor={onCallColor}
          onSellJoker={onSellJoker}
          onUseStashedItem={onUseStashedItem}
          onSellStashedItem={onSellStashedItem}
          className="deck-modifier-rail"
        />
      )}
      busy={runFrameBusy}
      className={`${resolvingScore ? "is-resolving-score" : ""}${discardPlayback ? " is-discarding-hand" : ""}${phase !== "playing" ? " has-rising-panel" : ""}`.trim()}
    >
      {phase === "playing" ? (
        <>
          <section
            className={`deck-resolve-zone${scorePlayback ? " has-played-cards" : ""}${scorePlayback?.phase === "discarding" ? " is-discarding" : ""}`}
            aria-label="제출 카드와 점수 계산 영역"
            data-score-phase={scorePhase}
            data-score-event={currentScoreEvent?.type}
          >
            {scorePlayback ? (
              <>
                <PlayedCardsView
                  cards={scorePlayback.cards}
                  breakdown={scorePlayback.breakdown}
                  scoreEvents={scorePlayback.events}
                  scoreEvent={currentScoreEvent}
                  scoreEventIndex={scorePlayback.eventIndex}
                  playbackPhase={scorePlayback.phase}
                />
                <div className={`deck-score-particles deck-score-particles-${currentScoreEvent?.emphasis ?? "subtle"}`} aria-hidden="true">
                  {Array.from({ length: 8 }, (_, index) => <i key={index} />)}
                </div>
              </>
            ) : null}
          </section>
          <section className="table-hand-stage deck-hand-stage deck-hand-stage--clean" aria-label="손패와 행동">
            <HandView cards={displayHand} selectedIds={selectedIds} discardingIds={discardPlayback?.cardIds ?? []} resolving={inputLocked} onToggleCard={onToggleCard} />
            <div className="table-action-dock">
              <button type="button" className="table-action play-action" disabled={inputLocked || !selectedIds.length} onClick={onPlay}><span>{resolvingScore ? "계산 중" : selectedIds.length ? `${selectedIds.length}장 내기` : "내기"}</span></button>
              <SortControl disabled={inputLocked} onChange={onSort} />
              <button type="button" className="table-action discard-action" disabled={inputLocked || !selectedIds.length || run.discardsLeft < 1} onClick={onDiscard}><span>{discardPlayback ? "버리는 중" : selectedIds.length ? `${selectedIds.length}장 버리기` : "버리기"}<small>남은 {run.discardsLeft}회</small></span></button>
            </div>
          </section>
        </>
      ) : (
        sceneContent
      )}
    </GameRunLayout>
  );
}

function SortControl({ disabled, onChange }: { disabled: boolean; onChange: (sort: HandSort) => void }) {
  return (
    <div className="deck-sort-control deck-sort-control-two-way" role="group" aria-label="손패 정렬">
      <span>핸드 정렬</span>
      <button type="button" disabled={disabled} aria-label="현재 손패를 숫자순으로 한 번 정렬" onClick={() => onChange("rank")}>숫자</button>
      <button type="button" disabled={disabled} aria-label="현재 손패를 색상순으로 한 번 정렬" onClick={() => onChange("color")}>색상</button>
    </div>
  );
}

function ColorPicker({ value, disabled = false, onChange }: { value: CardColor; disabled?: boolean; onChange: (color: CardColor) => void }) {
  return <div className="color-call" role="group" aria-label="호출할 채널">{CARD_COLORS.map((color) => <button type="button" key={color} disabled={disabled} className={`${color}${value === color ? " active" : ""}`} aria-label={`${COLOR_IDENTITIES[color].name} (${COLOR_IDENTITIES[color].koreanColor}) 선택`} aria-pressed={value === color} onClick={() => onChange(color)}><span>{COLOR_IDENTITIES[color].short}</span></button>)}</div>;
}

function RunInfoModal({
  run,
  onOpenHands,
  onOpenDeck,
  onClose,
}: {
  run: RunState;
  onOpenHands: () => void;
  onOpenDeck: () => void;
  onClose: () => void;
}) {
  const roundIndex = ROUND_ORDER.indexOf(run.round) + 1;
  const deckSize = run.deck?.length ?? run.hand.length + run.drawPile.length + run.discardPile.length;
  return (
    <Modal title="런 정보" onClose={onClose} wide>
      <div className="run-info-modal">
        <header>
          <span>ACTIVE RUN</span>
          <strong>STAGE {run.ante}-{roundIndex}</strong>
          <small>{run.mode === "standard" ? "5 STAGE 기본 런" : "무제한 런"} · ROUND {run.roundNumber}</small>
        </header>
        <dl className="run-info-grid">
          <div><dt>ROUND 목표</dt><dd>{run.target.toLocaleString()}</dd></div>
          <div><dt>현재 POINT</dt><dd>{run.score.toLocaleString()}</dd></div>
          <div><dt>COIN</dt><dd>{run.coins}¢</dd></div>
          <div><dt>HAND</dt><dd>{run.handsLeft}</dd></div>
          <div><dt>DISCARD</dt><dd>{run.discardsLeft}</dd></div>
          <div><dt>덱</dt><dd>{deckSize}장</dd></div>
          <div><dt>클리어 ROUND</dt><dd>{run.stats.roundsCleared}</dd></div>
          <div><dt>누적 POINT</dt><dd>{run.stats.totalScore.toLocaleString()}</dd></div>
          <div><dt>최고 핸드</dt><dd>{run.stats.highestHandScore.toLocaleString()}</dd></div>
          <div><dt>플레이한 HAND</dt><dd>{run.stats.handsPlayed}</dd></div>
          <div><dt>버린 카드</dt><dd>{run.stats.cardsDiscarded}</dd></div>
          <div><dt>메이헴 사용</dt><dd>{run.stats.unoUses}</dd></div>
        </dl>
        <div className="run-info-actions">
          <button type="button" className="secondary-button" onClick={onOpenHands}>족보와 레벨</button>
          <button type="button" className="secondary-button" onClick={onOpenDeck}>현재 덱 보기</button>
          <button type="button" className="primary-button" onClick={onClose}>게임으로 돌아가기</button>
        </div>
      </div>
    </Modal>
  );
}

function ResultView({ run, notice, signedIn, onRank, onRestart, onEndless, onLobby }: { run: RunState; notice: string; signedIn: boolean; onRank: () => void; onRestart: () => void; onEndless: () => void; onLobby: () => void }) {
  const won = run.phase === "won";
  return <main className="result-view"><section className="result-card"><div className="result-symbol">{won ? "✓" : "×"}</div><span className="kicker">{won ? "신호 연결 완료" : "연결 종료"}</span><h1>{won ? "메이헴 완주!" : "런 종료"}</h1><p>{won ? "5개의 STAGE를 모두 돌파했습니다. 이제 무제한 모드가 열렸습니다." : `STAGE ${run.ante}-${ROUND_ORDER.indexOf(run.round) + 1} · ${ROUND_LABEL[run.round]}에서 신호가 끊겼습니다.`}</p><div className="result-stats"><div><span>누적 점수</span><b>{run.stats.totalScore.toLocaleString()}</b></div><div><span>최고 핸드</span><b>{run.stats.highestHandScore.toLocaleString()}</b></div><div><span>메이헴 사용</span><b>{run.stats.unoUses}</b></div></div>{notice && <div className="status-strip">{notice}</div>}<div className="result-actions"><button type="button" className="secondary-button" onClick={onLobby}>로비로</button>{won && run.mode === "standard" ? <button type="button" className="primary-button" onClick={onEndless}>∞ 무제한 시작</button> : <button type="button" className="secondary-button" onClick={onRestart}>같은 모드 재도전</button>}<button type="button" className="primary-button" disabled={!signedIn} onClick={onRank}>{signedIn ? "공식 기록 제출" : "로그인 후 기록 제출"}</button></div></section></main>;
}

function AccountModal({
  user,
  onClose,
}: {
  user: InitialUser | null;
  onClose: () => void;
}) {
  return (
    <Modal title="플레이어 계정" onClose={onClose}>
      <div className="settings-body account-modal-body">
        <section>
          <span className="kicker">ACCOUNT</span>
          <div className="account-card">
            <i>{user?.displayName.slice(0, 1) ?? "게"}</i>
            <div>
              <b>{user?.displayName ?? "게스트 플레이어"}</b>
              <small>{user?.email ?? "현재 진행은 이 기기에 저장됩니다."}</small>
            </div>
            <a href={user ? "/signout-with-chatgpt?return_to=%2F" : "/signin-with-chatgpt?return_to=%2F"}>
              {user ? "로그아웃" : "로그인"}
            </a>
          </div>
          <p className="settings-help">
            {user
              ? "계정에 연결된 진행 상황을 다른 기기에서도 이어서 플레이할 수 있습니다."
              : "로그인하면 런, 제작 카드, 평가와 랭킹 기록을 계정에 연결합니다."}
          </p>
        </section>
      </div>
    </Modal>
  );
}

function SettingsModal({
  audio,
  reducedMotion,
  inRun,
  onOpenRunInfo,
  onExitRun,
  onReducedMotion,
  onClose,
}: {
  audio: ReturnType<typeof useGameAudio>;
  reducedMotion: boolean;
  inRun: boolean;
  onOpenRunInfo: () => void;
  onExitRun: () => void;
  onReducedMotion: (value: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="게임 옵션" onClose={onClose}>
      <div className="settings-body">
        {inRun && (
          <section>
            <span className="kicker">게임</span>
            <div className="settings-game-actions">
              <button type="button" onClick={onOpenRunInfo}><b>런 정보 · 족보</b><small>현재 레벨과 POWER × HYPE 확인</small></button>
              <button type="button" className="is-exit" onClick={onExitRun}><b>홈으로 나가기</b><small>진행 상황은 자동 저장됩니다</small></button>
            </div>
          </section>
        )}
        <section><span className="kicker">접근성</span><div className="setting-row"><span><b>모션 줄이기</b><small>점수 팝업과 카드 이동 애니메이션을 줄입니다.</small></span><button type="button" role="switch" aria-checked={reducedMotion} aria-label="모션 줄이기" className={`toggle${reducedMotion ? " on" : ""}`} onClick={() => onReducedMotion(!reducedMotion)}><i /></button></div></section>
        <section><span className="kicker">오디오</span><div className="setting-row"><span><b>배경 음악</b><small>런과 보스 장면별 배경음</small></span><button type="button" role="switch" aria-checked={audio.musicEnabled} aria-label="배경 음악" className={`toggle${audio.musicEnabled ? " on" : ""}`} onClick={audio.toggleMusic}><i /></button></div><label className="range-label" htmlFor="music-volume">배경 음악 볼륨</label><input id="music-volume" type="range" min="0" max="1" step="0.05" value={audio.musicVolume} onChange={(event) => audio.setMusicVolume(Number(event.target.value))} /><div className="setting-row"><span><b>효과음</b><small>카드, 점수, 상점 효과</small></span><button type="button" role="switch" aria-checked={audio.effectsEnabled} aria-label="효과음" className={`toggle${audio.effectsEnabled ? " on" : ""}`} onClick={audio.toggleEffects}><i /></button></div><label className="range-label" htmlFor="effects-volume">효과음 볼륨</label><input id="effects-volume" type="range" min="0" max="1" step="0.05" value={audio.effectsVolume} onChange={(event) => audio.setEffectsVolume(Number(event.target.value))} /></section>
      </div>
    </Modal>
  );
}
