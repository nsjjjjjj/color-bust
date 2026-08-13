"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  buyDeckWork,
  buyShopOffer,
  claimRoundReward,
  continueEndlessRun,
  createRun,
  discardCards,
  nextRound,
  playHand,
  previewHand,
  rerollShop,
  sellJoker,
  sellStashedItem,
  setHotSwapColor,
  skipPackOpening,
  takePackChoices,
  useStashedHandUpgrade as applyStashedHandUpgrade,
  useStashedItem as applyStashedItem,
} from "../lib/game/engine";
import {
  CARD_COLORS,
  DEFAULT_COMMUNITY_UNO_CARDS,
  effectiveHandChips,
  effectiveHandMultiplier,
  HAND_RULES,
  JOKER_CATALOG,
  ROUND_ORDER,
  UNO_MODULE_CATALOG,
} from "../lib/game/constants";
import { COLOR_IDENTITIES } from "../lib/game/colors";
import { PROTOCOL_CONFIG } from "../lib/game/garage-config";
import { buildScoreEvents, type ScoreEvent } from "../lib/game/score-events";
import { validateCommunityUnoCard } from "../lib/game/uno";
import { HAND_TYPES } from "../lib/game/types";
import type {
  CardColor,
  CommunityUnoCard as EngineUnoCard,
  GameCard,
  HandType,
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
import {
  CARD_SCORE_TICK_SEMITONES,
  MAX_CARD_SCORE_TICK_STEP,
  audioSceneForBossAnte,
  useGameAudio,
  type AudioScene,
} from "./use-game-audio";

type View = "lobby" | "game-select" | "game" | "leaderboard";
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
  /** Cards that should visibly deal from the draw pile after this discard. */
  readonly drawnCardIds: readonly string[];
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

/** actionLog is capped in length for long endless runs; actionSequence is the true ever-incrementing count. Legacy saves omit it. */
function actionCount(run: RunState): number {
  return run.actionSequence ?? run.actionLog.length;
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

/**
 * Storage can be unavailable on first launch (private browsing, interrupted
 * IndexedDB migration, or a flaky network). Do not let that prevent a new run
 * from starting.
 */
function resolveWithin<T>(work: Promise<T>, fallback: T, timeoutMs = 2_500): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(value);
    };
    const timeout = window.setTimeout(() => finish(fallback), timeoutMs);
    work.then(finish, () => finish(fallback));
  });
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

// The supplied chip-settle sample is about 0.97s. Start it inside the score
// transfer (and speed it up only when necessary) so its last chip lands as the
// round counter reaches its final value, rather than after the next draw starts.
const ROUND_SCORE_SETTLE_SOURCE_MS = 967;
function roundScoreSettleTiming(transferDurationMs: number) {
  const availableMs = Math.max(280, transferDurationMs - 34);
  const playbackRate = Math.min(2, Math.max(1, ROUND_SCORE_SETTLE_SOURCE_MS / availableMs));
  const audibleMs = ROUND_SCORE_SETTLE_SOURCE_MS / playbackRate;
  return {
    playbackRate,
    startDelayMs: Math.max(0, transferDurationMs - audibleMs - 18),
  };
}

export function GameApp({ initialUser }: { initialUser: InitialUser | null }) {
  const [view, setView] = useState<View>("lobby");
  const [run, setRun] = useState<RunState | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedUnoId, setSelectedUnoId] = useState<string | null>(null);
  // One inspector selection across the entire run shell. A shop card, MOD,
  // or MAYHEM card may be open — never several competing details at once.
  const [selectedDetailKey, setSelectedDetailKey] = useState<string | null>(null);
  const [calledColor, setCalledColor] = useState<CardColor>("red");
  const [calledColorTwo] = useState<CardColor>("blue");
  const [, setLastBreakdown] = useState<ScoreBreakdown | null>(null);
  const [equippedUno, setEquippedUno] = useState<CommunityUnoCard | undefined>();
  const [online, setOnline] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [playSelectOpen, setPlaySelectOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [guestbookOpen, setGuestbookOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [utilityModal, setUtilityModal] = useState<UtilityModal>(null);
  const [handOrder, setHandOrder] = useState<HandOrderState>({ scope: "", ids: [], activeSort: null });
  const [handSortMotionKey, setHandSortMotionKey] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pendingSellId, setPendingSellId] = useState<string | null>(null);
  const [pendingStartMode, setPendingStartMode] = useState<"standard" | "endless" | null>(null);
  const [pendingContinue, setPendingContinue] = useState(false);
  const [pendingLobbyExit, setPendingLobbyExit] = useState(false);
  const [syncConflict, setSyncConflict] = useState<SyncConflict | null>(null);
  const [scorePlayback, setScorePlayback] = useState<ScorePlayback | null>(null);
  const [scoreImpactKey, setScoreImpactKey] = useState<string | null>(null);
  const [discardPlayback, setDiscardPlayback] = useState<DiscardPlayback | null>(null);
  const [dealtCardIds, setDealtCardIds] = useState<readonly string[]>([]);
  const [displayRoundScore, setDisplayRoundScore] = useState(0);
  const [displayTransferScore, setDisplayTransferScore] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [loadingSave, setLoadingSave] = useState(true);
  const [cashOutLeaving, setCashOutLeaving] = useState(false);
  const cloudRevision = useRef<Record<"standard" | "endless", number>>({ standard: 0, endless: 0 });
  const latestRunRef = useRef<RunState | null>(null);
  const lastScoreSoundEventRef = useRef<string | null>(null);
  const lastScoreDepositRef = useRef<number | null>(null);
  const lastResultSoundRef = useRef<string | null>(null);
  const scoreCountUpFrameRef = useRef<number | null>(null);
  const scoreSettleTimerRef = useRef<number | null>(null);
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
  const queueScoreImpact = useCallback((key: string) => {
    // The pooled audio voice resolves only once playback has actually begun.
    // Starting one short frame afterwards makes the physical room jiggle feel
    // attached to the sound rather than leading it.
    window.setTimeout(() => setScoreImpactKey(key), 12);
  }, []);
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

  useLayoutEffect(() => {
    if (scoreCountUpFrameRef.current !== null) {
      window.cancelAnimationFrame(scoreCountUpFrameRef.current);
      scoreCountUpFrameRef.current = null;
    }
    if (scoreSettleTimerRef.current !== null) {
      window.clearTimeout(scoreSettleTimerRef.current);
      scoreSettleTimerRef.current = null;
    }

    const startScore = displayRoundScoreRef.current;
    if (!scoreAnimationActive || reducedMotion || startScore === scoreAnimationTarget) {
      displayRoundScoreRef.current = scoreAnimationTarget;
      setDisplayRoundScore(scoreAnimationTarget);
      setDisplayTransferScore(null);
      return;
    }

    const transferTotal = scorePlayback?.breakdown.total ?? 0;
    const duration = scoreTransferDuration(scorePlayback?.breakdown.total ?? 0);
    const settleTiming = roundScoreSettleTiming(duration);
    if (lastScoreDepositRef.current !== scorePlayback?.key) {
      scoreSettleTimerRef.current = window.setTimeout(() => {
        scoreSettleTimerRef.current = null;
        if (lastScoreDepositRef.current === scorePlayback?.key) return;
        lastScoreDepositRef.current = scorePlayback?.key ?? null;
        playEffect("round-score-settle", {
          gain: transferTotal >= 1_000 ? 1 : 0.86,
          maxVoices: 1,
          playbackRate: settleTiming.playbackRate,
        });
      }, reducedMotion ? 0 : settleTiming.startDelayMs);
    }
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
      setDisplayTransferScore(Math.max(0, Math.round(transferTotal * (1 - easedProgress))));
      if (progress < 1) {
        scoreCountUpFrameRef.current = window.requestAnimationFrame(animate);
      } else {
        scoreCountUpFrameRef.current = null;
        setDisplayTransferScore(0);
      }
    };
    scoreCountUpFrameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (scoreCountUpFrameRef.current !== null) {
        window.cancelAnimationFrame(scoreCountUpFrameRef.current);
        scoreCountUpFrameRef.current = null;
      }
      if (scoreSettleTimerRef.current !== null) {
        window.clearTimeout(scoreSettleTimerRef.current);
        scoreSettleTimerRef.current = null;
      }
    };
  }, [playEffect, reducedMotion, scoreAnimationActive, scoreAnimationTarget, scorePlayback?.breakdown.total, scorePlayback?.key]);

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
      try {
        const [localRuns, savedUno, savedMotion] = await Promise.all([
          resolveWithin(listLocalRuns<RunState>().catch(() => []), []),
          resolveWithin(getLocalSetting<CommunityUnoCard | undefined>("equippedCommunityUno", undefined).catch(() => undefined), undefined),
          resolveWithin(getLocalSetting<boolean>("reducedMotion", false).catch(() => false), false),
        ]);
        if (cancelled) return;
        setEquippedUno(savedUno);
        setReducedMotion(savedMotion);
        const local = localRuns.find((record) => isRunState(record.data) && record.data.phase !== "won" && record.data.phase !== "lost");
        if (local) replaceRun(local.data);

        // Local restore is all the start screen needs. Cloud sync can finish
        // afterwards without holding the entire game hostage.
        setLoadingSave(false);

        if (signedIn && navigator.onLine) {
          const remoteRuns = await Promise.all(["standard", "endless"].map(async (mode) => resolveWithin((async () => {
            try {
              const response = await fetch(`/api/runs/${mode}`, { credentials: "include" });
              if (!response.ok) return null;
              const data = (await response.json()) as { run: CloudRun | null };
              if (data.run) cloudRevision.current[data.run.mode] = data.run.revision;
              return data.run;
            } catch {
              return null;
            }
          })(), null, 4_000)));
          if (cancelled) return;
          const latestRemote = remoteRuns.filter(Boolean).sort((a, b) => Date.parse(b!.updatedAt) - Date.parse(a!.updatedAt))[0];
          const localUpdated = local?.updatedAt ?? 0;
          if (latestRemote && Date.parse(latestRemote.updatedAt) > localUpdated && isRunState(latestRemote.snapshot)) {
            replaceRun(latestRemote.snapshot);
            setNotice("다른 기기의 최신 진행을 불러왔습니다.");
          }
        }
      } finally {
        if (!cancelled) setLoadingSave(false);
      }
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
      saveLocalRun({ id: run.runId, revision: actionCount(run), updatedAt: Date.now(), data: run }).catch(() => undefined);
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
        // Leave enough room for the final submitted card to clear the table
        // before the next hand becomes interactive.
        reducedMotion ? 80 : 620,
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
        || actionCount(activeRun) !== discardPlayback.sourceActionCount) {
        setDiscardPlayback(null);
        return;
      }
      setRun(discardPlayback.nextState);
      setDealtCardIds(discardPlayback.drawnCardIds);
      setSelectedIds([]);
      setNotice(`${discardPlayback.discardedCount}장 버림 · 이번 라운드에는 다시 나오지 않습니다.`);
      setDiscardPlayback(null);
      playEffect("card-draw");
    // The selected cards leave in a short stagger before replacements deal in.
    // Keep the playback state alive through the final card's exit.
    }, reducedMotion ? 70 : 640);
    return () => window.clearTimeout(timer);
  }, [discardPlayback, playEffect, reducedMotion]);

  // `dealtCardIds` is only a short-lived entrance cue. Leaving it attached
  // after the deal completes lets the !important draw animation keep owning a
  // card's transform, which prevents a later selection from lifting that card.
  useEffect(() => {
    if (dealtCardIds.length === 0) return;
    const dealDuration = reducedMotion
      ? 60
      : 460 + Math.max(0, dealtCardIds.length - 1) * 62 + 48;
    const timer = window.setTimeout(() => setDealtCardIds([]), dealDuration);
    return () => window.clearTimeout(timer);
  }, [dealtCardIds, reducedMotion]);

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
      const pitchStep = Math.min(scoringCardStep, MAX_CARD_SCORE_TICK_STEP);
      playScoreEvent(soundEventKey, pitchStep, {
        semitonesPerStep: CARD_SCORE_TICK_SEMITONES,
        gain: scoringCardStep === scoringCardEvents.length - 1 ? 1.14 : 1,
        onStarted: () => queueScoreImpact(soundEventKey),
      });
      return;
    }
    if (!currentScoreSoundEvent.sourceCardId || eventStep < 0) return;
    const gain = currentScoreSoundEvent.type === "card-score" ? 1 : 0.72;
    playScoreEvent(soundEventKey, eventStep, {
      gain: eventStep === anchoredEvents.length - 1 ? gain * 1.14 : gain,
    });
  }, [currentScoreSoundEvent, playEffect, playScoreEvent, queueScoreImpact, scorePlayback]);

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
    audio.playEffect("cashout-claim", { gain: 0.92, maxVoices: 1 });
    cashOutTimerRef.current = window.setTimeout(() => {
      cashOutTimerRef.current = null;
      const current = latestRunRef.current;
      if (!current || current.runId !== rewardRun.runId || current.phase !== "reward") {
        setCashOutLeaving(false);
        return;
      }

      updateRun(() => claimRoundReward(current));
      setCashOutLeaving(false);
    }, reducedMotion ? 60 : 760);
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
    setHandSortMotionKey((key) => key + 1);
    audio.playEffect(nextSort === "rank" ? "hand-sort-rank" : "hand-sort-suit");
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
    setPlaySelectOpen(false);
    setCollectionOpen(false);
    setGuestbookOpen(false);
    setLeaderboardOpen(false);
    setAccountOpen(false);
  }


  function startRun(mode: "standard" | "endless") {
    const chosen = equippedUno ? serverCardToEngine(equippedUno) : null;
    const starter = DEFAULT_COMMUNITY_UNO_CARDS[0];
    // The equipped community card is the card the player actually starts
    // with. Previously it only entered the first-shop pool, so a freshly
    // equipped custom MAYHEM card appeared to disappear at run start.
    const startingMayhem = chosen ?? starter;
    // Keep the alternate card in the initial pool so the first shop still has
    // a deterministic MAYHEM signal without duplicating the owned card.
    const pool = chosen ? [starter, chosen] : DEFAULT_COMMUNITY_UNO_CARDS;
    const created = createRun({
      seed: crypto.randomUUID(),
      mode,
      startingCoins: 10,
      starterUno: startingMayhem,
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
      const result = playHand(run, selectedIds, selectedUnoId ? { unoCardId: selectedUnoId, calledColor, calledColorTwo } : {});
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
      const handIdsBeforeDiscard = new Set(run.hand.map((card) => card.id));
      setDiscardPlayback({
        key: Date.now(),
        sourceRunId: run.runId,
        sourceActionCount: actionCount(run),
        cardIds: [...selectedIds],
        drawnCardIds: nextState.hand
          .filter((card) => !handIdsBeforeDiscard.has(card.id))
          .map((card) => card.id),
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
      setView("lobby");
      setLeaderboardOpen(true);
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
    leaderboard: "랭킹",
    game: "런 결과",
  };
  const currentSection = sectionLabel[view];
  const immersiveView = view === "lobby" || view === "game-select"
    || (view === "game" && (!run || run.phase === "playing" || run.phase === "reward" || run.phase === "shop" || run.phase === "lost" || Boolean(scorePlayback)));
  const runScenePhase: RunLayoutPhase | null = view === "game" && run
    ? scorePlayback
      ? "playing"
      : run.phase === "playing" || run.phase === "reward" || run.phase === "shop"
        ? run.phase
        : run.phase === "lost"
          ? "playing"
        : null
    : null;

  return (
    <div
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

      {view === "lobby" && <Lobby savedRun={summary} equippedUno={equippedUno} signedIn={signedIn} online={online} onPlay={() => setPlaySelectOpen(true)} onOpenCommunity={() => setCollectionOpen(true)} onOpenAccount={() => setAccountOpen(true)} onOpenSettings={() => setSettingsOpen(true)} onOpenLeaderboard={() => setLeaderboardOpen(true)} onOpenGuestbook={() => setGuestbookOpen(true)} />}
      {view === "game-select" && (
        <GameSelectScreen
          savedRun={summary}
          loading={loadingSave}
          onContinue={() => setPendingContinue(true)}
          onNewGame={() => requestStartRun("standard")}
          onBack={openLobby}
        />
      )}
      {view === "leaderboard" && <LeaderboardView signedIn={signedIn} />}
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
              onCoinSettle={(index) => audio.playEffect("cashout-tick", {
                progressionStep: index,
                semitonesPerStep: 0.35,
                gain: 0.9,
                maxVoices: 2,
              })}
              onClaim={() => handleCashOutClaim(run)}
            />
          ) : runScenePhase === "shop" ? (
            <GarageView
              run={run}
              embedded
              notice={notice}
              selectedDetailKey={selectedDetailKey}
              onSelectedDetailChange={setSelectedDetailKey}
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
              onSelectDeckTarget={(offer, card) => {
                if (updateRun(() => buyDeckWork(run, offer.id, card.id))) audio.playEffect("buy");
              }}
              onTakePack={(_opening, choiceIds, targetCardId, targetColor) => {
                const nextState = updateRun(() => takePackChoices(run, choiceIds, targetCardId, targetColor));
                if (nextState) audio.playEffect("pack-pick", { progressionStep: Math.max(0, choiceIds.length - 1) });
                return nextState;
              }}
              onSkipPack={() => {
                const nextState = updateRun(() => skipPackOpening(run));
                if (nextState) {
                  audio.playEffect("ui-click", { gain: 0.38, maxVoices: 1 });
                  setNotice("팩 보상을 포기했습니다. 구매 금액은 반환되지 않습니다.");
                }
                return nextState;
              }}
              onPackOpen={() => audio.playEffect("pack-open", { maxVoices: 1 })}
              onPackReveal={(index) => audio.playEffect("pack-reveal", { progressionStep: index, semitonesPerStep: 0.6, maxVoices: 2 })}
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
          calledColorTwo={calledColorTwo}
          scorePlayback={scorePlayback}
          discardPlayback={discardPlayback}
          reducedMotion={reducedMotion}
          displayRoundScore={displayRoundScore}
          displayTransferScore={displayTransferScore}
          notice={notice}
          scoreImpactKey={scoreImpactKey}
          dealtCardIds={dealtCardIds}
          handOrderIds={handOrder.scope === `${run.runId}:${run.roundNumber}` ? handOrder.ids : []}
          activeHandSort={handOrder.scope === `${run.runId}:${run.roundNumber}` ? handOrder.activeSort : null}
          handSortMotionKey={handSortMotionKey}
          selectedDetailKey={selectedDetailKey}
          onSelectedDetailChange={setSelectedDetailKey}
          onToggleCard={handleToggleCard}
          onSelectUno={(id) => { setSelectedUnoId(id); audio.playEffect(id ? "mayhem-arm" : "ui-click", { gain: id ? 0.72 : 0.3, maxVoices: 1 }); }}
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
      {view === "game" && run && !scorePlayback && run.phase === "lost" && <RunLostModal run={run} onRestart={() => startRun(run.mode)} onLobby={openLobby} />}
      {view === "game" && run && !scorePlayback && run.phase === "won" && <ResultView run={run} notice={notice} signedIn={signedIn} onRank={submitRank} onRestart={() => startRun(run.mode)} onEndless={() => {
        if (updateRun(() => continueEndlessRun(run))) {
          setNotice("현재 빌드를 유지한 채 무제한 모드로 이어갑니다.");
          audio.playEffect("round-start", { maxVoices: 1 });
        }
      }} onLobby={openLobby} />}

      {currentSection && (
        <nav className="mobile-nav mobile-nav-contextual" aria-label="현재 화면">
          <button type="button" onClick={openLobby}><b>⌂</b>홈</button>
          <span><b aria-hidden="true">◆</b>{currentSection}</span>
        </nav>
      )}
      {notice && view !== "game" && <div className="global-notice" role="status">{notice}</div>}
      {loadingSave && <div className="loading-save" role="status">저장된 런 확인 중…</div>}
      {accountOpen && <AccountModal user={initialUser} onClose={() => setAccountOpen(false)} />}
      {settingsOpen && <SettingsModal audio={audio} reducedMotion={reducedMotion} startInSettings={view !== "game"} showNewRun={view === "game"} onNewRun={() => { setSettingsOpen(false); requestStartRun("standard"); }} onExitRun={() => { setSettingsOpen(false); if (view === "game" && run) setPendingLobbyExit(true); else openLobby(); }} onReducedMotion={(value) => { setReducedMotion(value); setLocalSetting("reducedMotion", value).catch(() => undefined); }} onClose={() => setSettingsOpen(false)} />}
      {playSelectOpen && <Modal title="플레이" className="lobby-bottom-sheet lobby-play-sheet" wide onClose={() => setPlaySelectOpen(false)}><GameSelectScreen embedded savedRun={summary} loading={loadingSave} onContinue={() => { setPlaySelectOpen(false); setPendingContinue(true); }} onNewGame={() => { setPlaySelectOpen(false); requestStartRun("standard"); }} onBack={() => setPlaySelectOpen(false)} /></Modal>}
      {collectionOpen && <Modal title="컬렉션" className="lobby-bottom-sheet" wide onClose={() => setCollectionOpen(false)}><CommunityHub signedIn={signedIn} equippedId={equippedUno?.id} onEquip={(card) => { setEquippedUno(card); setLocalSetting("equippedCommunityUno", card).catch(() => undefined); setNotice(""); audio.playEffect("equip", { maxVoices: 1 }); }} /></Modal>}
      {guestbookOpen && <Modal title="평가소" className="lobby-bottom-sheet" wide onClose={() => setGuestbookOpen(false)}><GuestbookView signedIn={signedIn} /></Modal>}
      {leaderboardOpen && <Modal title="랭킹" className="lobby-bottom-sheet lobby-leaderboard-sheet" wide onClose={() => setLeaderboardOpen(false)}><LeaderboardView signedIn={signedIn} /></Modal>}
      {utilityModal === "run-info" && run && <RunInfoModal run={run} onClose={() => setUtilityModal(null)} />}
      {utilityModal === "hands" && <HandGuide handLevels={run?.handLevels ?? BASE_HAND_LEVELS} onClose={() => setUtilityModal(null)} />}
      {utilityModal === "deck" && run && <DeckInspector deck={run.deck} drawPile={run.drawPile} discardPile={run.discardPile} hand={run.hand} onClose={() => setUtilityModal(null)} />}
      {pendingSellId && run && (() => {
        const owned = run.jokers.find((joker) => joker.instanceId === pendingSellId);
        if (!owned) return null;
        const definition = JOKER_CATALOG[owned.jokerId];
        const refund = Math.max(1, Math.floor(definition.price / 2));
        return <Modal title="조커 판매" onClose={() => setPendingSellId(null)}><div className="confirm-body"><div className="confirm-joker"><span>{definition.name.slice(0, 1)}</span><div><b>{definition.name}</b><small>{definition.description}</small></div></div><p>이 조커를 판매하고 <strong>{refund}¢</strong>를 받을까요?</p><div className="confirm-actions"><button type="button" className="secondary-button" onClick={() => setPendingSellId(null)}>취소</button><button type="button" className="primary-button" onClick={() => { if (updateRun(() => sellJoker(run, pendingSellId))) audio.playEffect("sell", { maxVoices: 1 }); setPendingSellId(null); }}>판매 +{refund}¢</button></div></div></Modal>;
      })()}
      {pendingContinue && run && <Modal title="이어서 하기" className="run-confirm-sheet" onClose={() => setPendingContinue(false)}><div className="confirm-body run-confirm-body"><p><strong>마지막 런을 이어서 할까요?</strong><br />현재 진행 지점부터 바로 시작합니다.</p><section className="run-save-card" aria-label="이어갈 진행"><span>LAST RUN</span><b>STAGE {run.ante}-{ROUND_ORDER.indexOf(run.round) + 1} · ROUND {run.roundNumber}</b><small>{run.score.toLocaleString()} / {run.target.toLocaleString()} POINT · {run.coins}¢</small></section><div className="confirm-actions"><button type="button" className="secondary-button" onClick={() => setPendingContinue(false)}>취소</button><button type="button" className="primary-button" onClick={() => { setPendingContinue(false); setView("game"); }}>이어서 하기</button></div></div></Modal>}
      {pendingStartMode && run && <Modal title="새로운 런" className="run-confirm-sheet" onClose={() => setPendingStartMode(null)}><div className="confirm-body run-confirm-body"><p><strong>새로운 런을 시작하시겠습니까?</strong><br />현재 진행 중인 런은 새 기록으로 교체됩니다.</p><section className="run-save-card" aria-label="교체될 진행"><span>현재 저장</span><b>STAGE {run.ante}-{ROUND_ORDER.indexOf(run.round) + 1}</b></section><div className="confirm-actions"><button type="button" className="secondary-button" onClick={() => setPendingStartMode(null)}>취소</button><button type="button" className="primary-button" onClick={() => { const mode = pendingStartMode; setPendingStartMode(null); startRun(mode); }}>새로운 런 시작</button></div></div></Modal>}
      {pendingLobbyExit && run && <Modal title="홈으로 이동" className="run-confirm-sheet" onClose={() => setPendingLobbyExit(false)}><div className="confirm-body run-confirm-body"><p><strong>홈으로 이동하시겠습니까?</strong><br />현재 게임 진행 상황은 자동으로 저장됩니다.</p><section className="run-save-card" aria-label="저장될 진행"><span>저장될 진행</span><b>STAGE {run.ante}-{ROUND_ORDER.indexOf(run.round) + 1}</b></section><div className="confirm-actions"><button type="button" className="secondary-button" onClick={() => setPendingLobbyExit(false)}>취소</button><button type="button" className="primary-button" onClick={() => { setPendingLobbyExit(false); openLobby(); }}>저장하고 나가기</button></div></div></Modal>}
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
  calledColorTwo,
  scorePlayback,
  discardPlayback,
  reducedMotion,
  displayRoundScore,
  displayTransferScore,
  notice,
  scoreImpactKey,
  dealtCardIds,
  handOrderIds,
  activeHandSort,
  handSortMotionKey,
  selectedDetailKey,
  onSelectedDetailChange,
  onToggleCard,
  onSelectUno,
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
  calledColorTwo: CardColor;
  scorePlayback: ScorePlayback | null;
  discardPlayback: DiscardPlayback | null;
  reducedMotion: boolean;
  displayRoundScore: number;
  displayTransferScore: number | null;
  notice: string;
  scoreImpactKey: string | null;
  dealtCardIds: readonly string[];
  handOrderIds: readonly string[];
  activeHandSort: HandSort | null;
  handSortMotionKey: number;
  selectedDetailKey: string | null;
  onSelectedDetailChange: (key: string | null) => void;
  onToggleCard: (id: string) => void;
  onSelectUno: (id: string | null) => void;
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
        selectedUnoId ? { unoCardId: selectedUnoId, calledColor, calledColorTwo } : {},
      );
    } catch {
      return null;
    }
  }, [calledColor, calledColorTwo, phase, run, scorePlayback, selectedIds, selectedUnoId]);
  const selectedHandName = selectedBreakdown?.handName ?? null;
  const shown = phase !== "playing"
    ? null
    : scorePlayback
      ? (scorePlayback.phase === "moving" || scorePlayback.phase === "scoring"
        ? scorePlayback.breakdown
        : null)
      : selectedBreakdown;
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
    // `run.deck` is the authoritative persistent deck.  A card selected from
    // a pack exists there immediately, but does not join draw/hand/discard
    // until the next deal.  Using the three live piles here delayed the dock's
    // total by a whole round.
    () => run.deck ?? [...displayedDrawPile, ...displayedDiscardPile, ...referenceHand],
    [displayedDiscardPile, displayedDrawPile, referenceHand, run.deck],
  );
  const resolvedRailValues = shown ? resolvedBreakdownValues(shown) : { power: 0, hype: 0 };
  const selectedHandBase = selectedBreakdown
    ? { power: selectedBreakdown.baseChips, hype: selectedBreakdown.baseMultiplier }
    : null;
  // `playHand` has already produced the authoritative next RunState when the
  // cards begin moving. Do not let that completed breakdown leak into the
  // HUD before the timeline reaches its own base/card/MOD beats.
  const railPower = scorePlayback
    ? currentScoreEvent?.currentChips ?? 0
    : selectedHandBase?.power ?? resolvedRailValues.power;
  const railHype = scorePlayback
    ? currentScoreEvent
      ? currentScoreEvent.currentMultiplier * currentScoreEvent.currentXMultiplier
      : 0
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
  // The score sound rises only for card-score beats. Mirror that staircase in
  // the cabinet recoil, without making MOD-only beats feel progressively huge.
  const scoreImpactStep = currentScoreEvent?.type === "card-score"
    ? Math.max(0, scorePlayback?.events
      .filter((event) => event.type === "card-score")
      .findIndex((event) => event.id === currentScoreEvent.id) ?? 0)
    : 0;
  return (
    <GameRunLayout
      run={run}
      phase={phase}
      notice={notice || (phase === "playing" && selectedIds.length ? `${selectedIds.length}/5 카드 선택됨` : "")}
      displayRoundScore={displayRoundScore}
      power={railPower}
      hype={railHype}
      handName={shown?.handName ?? null}
      handLevel={shown?.handLevel ?? null}
      scorePulse={railScorePulse}
      scoreEventKey={currentScoreEvent?.id ?? null}
      scoreImpactKey={reducedMotion ? null : scoreImpactKey}
      scoreImpactStep={scoreImpactStep}
      isTransferring={scorePlayback?.phase === "transferring"}
      transferScore={scorePlayback?.phase === "transferring" ? displayTransferScore : null}
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
          disabled={inputLocked}
          onSelectUno={onSelectUno}
          onSellJoker={onSellJoker}
          onUseStashedItem={onUseStashedItem}
          onSellStashedItem={onSellStashedItem}
          selectedDetailKey={selectedDetailKey}
          onSelectedDetailChange={onSelectedDetailChange}
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
            <HandView cards={displayHand} selectedIds={selectedIds} discardingIds={discardPlayback?.cardIds ?? []} dealtCardIds={dealtCardIds} resolving={inputLocked} sortMotionKey={handSortMotionKey} onToggleCard={onToggleCard} />
            <div className="table-action-dock">
              <button type="button" className="table-action play-action" disabled={inputLocked || !selectedIds.length} onClick={onPlay}><span>{resolvingScore ? "계산 중" : "내기"}</span></button>
              <SortControl disabled={inputLocked} onChange={onSort} />
              <button type="button" className="table-action discard-action" disabled={inputLocked || !selectedIds.length || run.discardsLeft < 1} onClick={onDiscard}><span>{discardPlayback ? "버리는 중" : "버리기"}</span></button>
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
      <button type="button" disabled={disabled} aria-label="현재 손패를 숫자순으로 한 번 정렬" onClick={() => onChange("rank")}>랭크</button>
      <button type="button" disabled={disabled} aria-label="현재 손패를 색상순으로 한 번 정렬" onClick={() => onChange("color")}>수트</button>
    </div>
  );
}

function ColorPicker({ value, disabled = false, onChange }: { value: CardColor; disabled?: boolean; onChange: (color: CardColor) => void }) {
  return <div className="color-call" role="group" aria-label="호출할 채널">{CARD_COLORS.map((color) => <button type="button" key={color} disabled={disabled} className={`${color}${value === color ? " active" : ""}`} aria-label={`${COLOR_IDENTITIES[color].name} (${COLOR_IDENTITIES[color].koreanColor}) 선택`} aria-pressed={value === color} onClick={() => onChange(color)}><span>{COLOR_IDENTITIES[color].short}</span></button>)}</div>;
}

type HandExampleCard = {
  readonly color: CardColor;
  readonly rank: number;
};

const HAND_PLAY_EXAMPLES: Readonly<Record<HandType, {
  readonly cards: readonly HandExampleCard[];
  readonly description: string;
}>> = {
  "high-card": {
    cards: [{ color: "blue", rank: 9 }],
    description: "다른 족보가 없을 때 가장 높은 카드 1장이 득점합니다.",
  },
  pair: {
    cards: [{ color: "red", rank: 7 }, { color: "blue", rank: 7 }],
    description: "숫자가 같은 카드 2장을 함께 냅니다.",
  },
  "two-pair": {
    cards: [{ color: "red", rank: 6 }, { color: "blue", rank: 6 }, { color: "green", rank: 3 }, { color: "yellow", rank: 3 }],
    description: "서로 다른 숫자의 페어 2개를 함께 냅니다.",
  },
  "three-of-a-kind": {
    cards: [{ color: "red", rank: 5 }, { color: "blue", rank: 5 }, { color: "green", rank: 5 }],
    description: "숫자가 같은 카드 3장을 함께 냅니다.",
  },
  straight: {
    cards: [{ color: "red", rank: 3 }, { color: "blue", rank: 4 }, { color: "green", rank: 5 }, { color: "yellow", rank: 6 }, { color: "red", rank: 7 }],
    description: "색과 관계없이 이어지는 숫자 5장을 냅니다.",
  },
  flush: {
    cards: [{ color: "green", rank: 1 }, { color: "green", rank: 3 }, { color: "green", rank: 5 }, { color: "green", rank: 7 }, { color: "green", rank: 9 }],
    description: "같은 채널(색) 카드 5장을 냅니다.",
  },
  "full-house": {
    cards: [{ color: "red", rank: 8 }, { color: "blue", rank: 8 }, { color: "green", rank: 8 }, { color: "red", rank: 4 }, { color: "yellow", rank: 4 }],
    description: "같은 숫자 3장과 다른 같은 숫자 2장을 함께 냅니다.",
  },
  "four-of-a-kind": {
    cards: [{ color: "red", rank: 9 }, { color: "blue", rank: 9 }, { color: "green", rank: 9 }, { color: "yellow", rank: 9 }],
    description: "네 색의 같은 숫자 4장을 함께 냅니다.",
  },
  "straight-flush": {
    cards: [{ color: "yellow", rank: 4 }, { color: "yellow", rank: 5 }, { color: "yellow", rank: 6 }, { color: "yellow", rank: 7 }, { color: "yellow", rank: 8 }],
    description: "같은 채널에서 이어지는 숫자 5장을 냅니다.",
  },
};

function HandPlayExample({ handType }: { handType: HandType | null }) {
  const example = handType ? HAND_PLAY_EXAMPLES[handType] : null;
  return (
    <aside className="run-hand-example" role="status" aria-live="polite">
      <span className="run-hand-example-kicker">{handType ? `족보 예시 · ${HAND_RULES[handType].name}` : "족보 예시"}</span>
      {example ? (
        <>
          <div className="run-hand-example-cards" aria-hidden="true">
            {example.cards.map((card, index) => (
              <span className={`run-hand-example-card is-${card.color}`} key={`${card.color}-${card.rank}-${index}`}>
                <i>{card.rank}</i><small>M</small>
              </span>
            ))}
          </div>
          <p>{example.description}</p>
        </>
      ) : <p>아래 족보 행에 마우스를 올리면 필요한 카드 조합이 표시됩니다.</p>}
    </aside>
  );
}

function RunInfoModal({
  run,
  onClose,
}: {
  run: RunState;
  onClose: () => void;
}) {
  const [exampleHandType, setExampleHandType] = useState<HandType | null>(null);
  const handUses = run.handHistory.reduce<Record<HandType, number>>((counts, handType) => {
    counts[handType] += 1;
    return counts;
  }, Object.fromEntries(HAND_TYPES.map((handType) => [handType, 0])) as Record<HandType, number>);

  return (
    <Modal title="런 정보" onClose={onClose} wide className="run-info-sheet" hideHeader>
      <div className="run-info-sheet-content">
        <HandPlayExample handType={exampleHandType} />
        <section className="run-hand-list" aria-label="족보별 현재 POWER와 HYPE" onMouseLeave={() => setExampleHandType(null)}>
          {([...HAND_TYPES].reverse()).map((handType) => {
            const rule = HAND_RULES[handType];
            const level = Math.max(1, run.handLevels[handType] ?? 1);
            const power = effectiveHandChips(rule, level);
            const hype = effectiveHandMultiplier(rule, level);
            return (
              <button
                type="button"
                className="run-hand-row"
                key={handType}
                aria-describedby="run-hand-example-description"
                onMouseEnter={() => setExampleHandType(handType)}
                onClick={() => setExampleHandType(handType)}
              >
                <b className="run-hand-level">Lv.{level}</b>
                <strong className="run-hand-name">{rule.name}</strong>
                <span className="run-hand-equation" aria-label={`POWER ${power} 곱하기 HYPE ${hype}`}>
                  <b>{power.toLocaleString()}</b><i>×</i><strong>{hype.toLocaleString()}</strong>
                </span>
                <span className="run-hand-used" aria-label={`이번 런에서 ${handUses[handType]}번 사용`}><i>#</i>{handUses[handType]}</span>
              </button>
            );
          })}
        </section>
        <span className="modal-visually-hidden" id="run-hand-example-description">족보 행에 마우스를 올리거나 선택하면 필요한 카드 예시를 표시합니다.</span>

        <button type="button" className="run-info-back" onClick={onClose}>뒤로</button>
      </div>
    </Modal>
  );
}

function RunLostModal({ run, onRestart, onLobby }: { run: RunState; onRestart: () => void; onLobby: () => void }) {
  const roundIndex = ROUND_ORDER.indexOf(run.round) + 1;

  return (
    <div className="run-lost-overlay" role="dialog" aria-modal="true" aria-labelledby="run-lost-title">
      <section className="run-lost-card">
        <span className="run-lost-kicker">SIGNAL LOST</span>
        <div className="run-lost-mark" aria-hidden="true">×</div>
        <h1 id="run-lost-title">런 종료</h1>
        <p>STAGE {run.ante}-{roundIndex} · {ROUND_LABEL[run.round]}</p>
        <div className="run-lost-score" aria-label={`누적 점수 ${run.stats.totalScore.toLocaleString()}점`}>
          <span>누적 점수</span><strong>{run.stats.totalScore.toLocaleString()}</strong>
        </div>
        <div className="run-lost-actions">
          <button type="button" className="secondary-button" onClick={onLobby}>로비로</button>
          <button type="button" className="primary-button" onClick={onRestart}>재시도</button>
        </div>
      </section>
    </div>
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
  const [screen, setScreen] = useState<"account" | "login" | "register">("account");
  const [authError, setAuthError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const registering = screen === "register";

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setAuthError("");
    const response = await fetch(registering ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new FormData(event.currentTarget),
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) as { error?: string } | null : null;
    if (!response?.ok) {
      setAuthError(payload?.error ?? "계정 연결을 완료하지 못했습니다.");
      setSubmitting(false);
      return;
    }
    window.location.reload();
  }

  return (
    <Modal title={screen === "account" ? "플레이어 계정" : registering ? "새 파일 생성" : "런 불러오기"} className="lobby-bottom-sheet account-sheet" onClose={onClose}>
      <div className="settings-body account-modal-body">
        {screen === "account" ? (
        <section>
          <span className="kicker">ACCOUNT</span>
          <div className="account-card">
            <i>{user?.displayName.slice(0, 1) ?? "게"}</i>
            <div>
              <b>{user?.displayName ?? "게스트 플레이어"}</b>
              <small>{user?.email ?? "현재 진행은 이 기기에 저장됩니다."}</small>
            </div>
            {user ? <a href="/signout-with-chatgpt?return_to=%2F">로그아웃</a> : <button type="button" onClick={() => setScreen("login")}>로그인</button>}
          </div>
          <p className="settings-help">
            {user
              ? "계정에 연결된 진행 상황을 다른 기기에서도 이어서 플레이할 수 있습니다."
              : "로그인하면 런, 제작 카드, 평가와 랭킹 기록을 계정에 연결합니다."}
          </p>
        </section>
        ) : (
          <section className="account-auth-form">
            <span className="kicker">DECK MAYHEM CLOUD</span>
            <p>{registering ? "새 계정에 런과 커뮤니티 기록을 연결합니다." : "기존 런과 온라인 기록을 불러옵니다."}</p>
            <div className="account-auth-tabs" role="tablist" aria-label="계정 방식">
              <button type="button" className={!registering ? "active" : ""} onClick={() => { setScreen("login"); setAuthError(""); }}>로그인</button>
              <button type="button" className={registering ? "active" : ""} onClick={() => { setScreen("register"); setAuthError(""); }}>회원가입</button>
            </div>
            <form onSubmit={submitCredentials}>
              {registering && <label>닉네임<input name="displayName" minLength={2} maxLength={24} autoComplete="nickname" required /></label>}
              <label>이메일<input name="email" type="email" maxLength={254} autoComplete="email" required /></label>
              <label>비밀번호<input name="password" type="password" minLength={8} maxLength={72} autoComplete={registering ? "new-password" : "current-password"} required /></label>
              {authError && <p className="account-auth-error" role="alert">{authError}</p>}
              <button type="submit" className="primary-button" disabled={submitting}>{submitting ? "연결 중…" : registering ? "계정 만들기" : "로그인"}</button>
              <button type="button" className="secondary-button" onClick={() => setScreen("account")}>뒤로</button>
            </form>
          </section>
        )}
      </div>
    </Modal>
  );
}

function SettingsModal({
  audio,
  reducedMotion,
  startInSettings,
  showNewRun,
  onNewRun,
  onExitRun,
  onReducedMotion,
  onClose,
}: {
  audio: ReturnType<typeof useGameAudio>;
  reducedMotion: boolean;
  startInSettings: boolean;
  showNewRun: boolean;
  onNewRun: () => void;
  onExitRun: () => void;
  onReducedMotion: (value: boolean) => void;
  onClose: () => void;
}) {
  const [screen, setScreen] = useState<"menu" | "settings">(startInSettings ? "settings" : "menu");

  return (
    <Modal title="옵션" onClose={onClose} className="options-sheet" hideHeader>
      <div className="options-sheet-content">
        {screen === "menu" ? (
          <>
            <header className="options-sheet-title"><span>PAUSE MENU</span><h2>옵션</h2></header>
            <nav className="options-menu-actions" aria-label="옵션 메뉴">
              <button type="button" onClick={onExitRun}><b>메인 메뉴</b></button>
              {showNewRun && <button type="button" onClick={onNewRun}><b>새로운 런</b></button>}
              <button type="button" onClick={() => setScreen("settings")}><b>설정</b></button>
            </nav>
            <button type="button" className="options-sheet-back" onClick={onClose}>뒤로</button>
          </>
        ) : (
          <>
            <header className="options-sheet-title"><span>SETTINGS</span><h2>설정</h2></header>
            <section className="options-settings-list" aria-label="게임 설정">
              <section className="options-setting-card">
                <div className="options-setting-row"><span><b>배경 음악</b><small>런과 보스 장면별 배경음</small></span><button type="button" role="switch" aria-checked={audio.musicEnabled} aria-label="배경 음악" className={`toggle${audio.musicEnabled ? " on" : ""}`} onClick={audio.toggleMusic}><i /></button></div>
                <label className="options-volume" htmlFor="music-volume"><span>배경 음악 볼륨</span><input id="music-volume" type="range" min="0" max="1" step="0.05" value={audio.musicVolume} onChange={(event) => audio.setMusicVolume(Number(event.target.value))} /></label>
              </section>
              <section className="options-setting-card">
                <div className="options-setting-row"><span><b>효과음</b><small>카드, 점수, 상점 효과</small></span><button type="button" role="switch" aria-checked={audio.effectsEnabled} aria-label="효과음" className={`toggle${audio.effectsEnabled ? " on" : ""}`} onClick={audio.toggleEffects}><i /></button></div>
                <label className="options-volume" htmlFor="effects-volume"><span>효과음 볼륨</span><input id="effects-volume" type="range" min="0" max="1" step="0.05" value={audio.effectsVolume} onChange={(event) => audio.setEffectsVolume(Number(event.target.value))} /></label>
              </section>
              <div className="options-setting-row"><span><b>모션 줄이기</b><small>점수 팝업과 카드 이동을 줄입니다</small></span><button type="button" role="switch" aria-checked={reducedMotion} aria-label="모션 줄이기" className={`toggle${reducedMotion ? " on" : ""}`} onClick={() => onReducedMotion(!reducedMotion)}><i /></button></div>
            </section>
            <button type="button" className="options-sheet-back" onClick={startInSettings ? onClose : () => setScreen("menu")}>뒤로</button>
          </>
        )}
      </div>
    </Modal>
  );
}
