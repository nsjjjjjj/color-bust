"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buyShopOffer,
  createRun,
  discardCards,
  nextRound,
  playHand,
  rerollShop,
  sellJoker,
  setHotSwapColor,
} from "../lib/game/engine";
import { evaluateHand } from "../lib/game/hands";
import {
  CARD_COLORS,
  DEFAULT_COMMUNITY_UNO_CARDS,
  HAND_RULES,
  JOKER_SLOT_LIMIT,
  JOKER_CATALOG,
  ROUND_ORDER,
  UNO_SLOT_LIMIT,
  UNO_MODULE_CATALOG,
} from "../lib/game/constants";
import { buildScoreEvents, type ScoreEvent } from "../lib/game/score-events";
import { validateCommunityUnoCard } from "../lib/game/uno";
import type {
  CardColor,
  CommunityUnoCard as EngineUnoCard,
  GameCard,
  RunState,
  ScoreBreakdown,
  ShopOffer,
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
  saveLocalRun,
  setLocalSetting,
  subscribeConnectivity,
} from "../lib/offline";
import {
  orderHand,
  sortHandOnce,
  type HandSort,
} from "../lib/ui/hand-order";
import { CommunityHub } from "./components/community-hub";
import { DeckInspector, HandGuide, ShortcutGuide } from "./components/game-reference";
import { GameLeftRail } from "./components/game-side-panels";
import { HandView, PlayedCardsView } from "./components/hand-view";
import { Lobby, type RunSummary } from "./components/lobby";
import { Modal } from "./components/modal";
import { ModifierRail } from "./components/modifier-rail";
import { PileInspector } from "./components/pile-inspector";
import { GuestbookView, LeaderboardView } from "./components/social-views";
import { audioSceneForBossAnte, useGameAudio, type AudioScene } from "./use-game-audio";

type View = "lobby" | "game" | "community" | "leaderboard" | "guestbook";
type UtilityModal = "hands" | "deck" | "shortcuts" | null;
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
  small: "스몰 블라인드",
  big: "빅 블라인드",
  boss: "보스 블라인드",
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

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

function formatScoreEventValue(event: ScoreEvent | null): string {
  if (!event) return "";
  if (event.type === "final-score") return event.currentTotal.toLocaleString();
  if (event.multiplierMode === "base") {
    return `${event.value?.toLocaleString() ?? 0}칩 × ${event.multiplier ?? 0}배수`;
  }

  const parts: string[] = [];
  if (event.value !== undefined) {
    const unit = event.operation === "set-score" ? "점" : "칩";
    parts.push(`${event.value >= 0 ? "+" : ""}${event.value.toLocaleString()} ${unit}`);
  }
  if (event.multiplierMode === "additive" && event.multiplier !== undefined) {
    parts.push(`${event.multiplier >= 0 ? "+" : ""}${event.multiplier}배수`);
  } else if (event.multiplierMode === "multiplicative" && event.multiplier !== undefined) {
    parts.push(`×${event.multiplier.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`);
  }
  if (event.reward !== undefined) {
    parts.push(`${event.reward >= 0 ? "+" : ""}${event.reward}¢`);
  }
  return parts.join(" · ") || "확인";
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
  const hold = event.emphasis === "final"
    ? 520
    : event.emphasis === "strong"
      ? 390
      : event.emphasis === "subtle"
        ? 150
        : 240;
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
  const [view, setView] = useState<View>("lobby");
  const [run, setRun] = useState<RunState | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedUnoId, setSelectedUnoId] = useState<string | null>(null);
  const [calledColor, setCalledColor] = useState<CardColor>("red");
  const [lastBreakdown, setLastBreakdown] = useState<ScoreBreakdown | null>(null);
  const [equippedUno, setEquippedUno] = useState<CommunityUnoCard | undefined>();
  const [online, setOnline] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [utilityModal, setUtilityModal] = useState<UtilityModal>(null);
  const [handOrder, setHandOrder] = useState<{ scope: string; ids: readonly string[] }>({ scope: "", ids: [] });
  const [highContrast, setHighContrast] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pendingSellId, setPendingSellId] = useState<string | null>(null);
  const [pendingStartMode, setPendingStartMode] = useState<"standard" | "endless" | null>(null);
  const [syncConflict, setSyncConflict] = useState<SyncConflict | null>(null);
  const [scorePlayback, setScorePlayback] = useState<ScorePlayback | null>(null);
  const [discardPlayback, setDiscardPlayback] = useState<DiscardPlayback | null>(null);
  const [displayRoundScore, setDisplayRoundScore] = useState(0);
  const [notice, setNotice] = useState("");
  const [loadingSave, setLoadingSave] = useState(true);
  const cloudRevision = useRef<Record<"standard" | "endless", number>>({ standard: 0, endless: 0 });
  const latestRunRef = useRef<RunState | null>(null);
  const lastScoreSoundEventRef = useRef<string | null>(null);
  const scoreCountUpFrameRef = useRef<number | null>(null);
  const displayRoundScoreRef = useRef(0);
  const nextShortcutSortRef = useRef<HandSort>("rank");

  const replaceRun = useCallback((state: RunState) => {
    setRun(state);
    setSelectedIds([]);
    setSelectedUnoId(null);
    setLastBreakdown(null);
    setScorePlayback(null);
    setDiscardPlayback(null);
    setHandOrder({
      scope: `${state.runId}:${state.roundNumber}`,
      ids: state.hand.map((card) => card.id),
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
  const playScoreTick = audio.playScoreTick;
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
  const transferRemainingScore = scorePlayback?.phase === "transferring"
    ? Math.max(0, scorePlayback.roundScoreBefore + scorePlayback.breakdown.total - displayRoundScore)
    : undefined;

  useEffect(() => {
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

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const [localRuns, savedUno, savedContrast, savedMotion] = await Promise.all([
        listLocalRuns<RunState>().catch(() => []),
        getLocalSetting<CommunityUnoCard | undefined>("equippedCommunityUno", undefined).catch(() => undefined),
        getLocalSetting<boolean>("highContrast", false).catch(() => false),
        getLocalSetting<boolean>("reducedMotion", false).catch(() => false),
      ]);
      if (cancelled) return;
      setEquippedUno(savedUno);
      setHighContrast(savedContrast);
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
            ? `라운드 클리어 · ${scorePlayback.breakdown.roundReward}코인 획득`
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

  useEffect(() => {
    if (!scorePlayback || !currentScoreSoundEvent) {
      lastScoreSoundEventRef.current = null;
      return;
    }
    const soundEventKey = `${scorePlayback.key}:${currentScoreSoundEvent.id}`;
    if (lastScoreSoundEventRef.current === soundEventKey) return;
    lastScoreSoundEventRef.current = soundEventKey;

    if (currentScoreSoundEvent.type !== "card-score") return;
    const cardScoreEvents = scorePlayback.events.filter((event) => event.type === "card-score");
    const cardStep = cardScoreEvents.findIndex((event) => event.id === currentScoreSoundEvent.id);
    if (cardStep < 0) return;
    playScoreTick(cardStep, {
      gain: cardStep === cardScoreEvents.length - 1 ? 1.18 : 1,
    });
  }, [currentScoreSoundEvent, playScoreTick, scorePlayback]);

  function updateRun(action: () => RunState): boolean {
    try {
      setRun(action());
      setNotice("");
      return true;
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "행동을 처리할 수 없습니다.");
      return false;
    }
  }

  function handleToggleCard(id: string) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((value) => value !== id));
      audio.playEffect("card-select");
      return;
    }
    if (selectedIds.length >= 5) {
      setNotice("한 번에 최대 5장까지 선택할 수 있습니다.");
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
    }));
    nextShortcutSortRef.current = nextSort === "rank" ? "color" : "rank";
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
    setRun(created);
    setSelectedIds([]);
    setLastBreakdown(null);
    setScorePlayback(null);
    setDiscardPlayback(null);
    setSelectedUnoId(null);
    setHandOrder({
      scope: `${created.runId}:${created.roundNumber}`,
      ids: created.hand.map((card) => card.id),
    });
    setView("game");
    audio.playEffect("deck-setup");
    setNotice(mode === "standard" ? "5 앤티 런을 시작합니다." : "끝없는 신호에 접속했습니다.");
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
      audio.playEffect("card-play");
      setSelectedUnoId(null);
      setNotice("카드를 제출했습니다. 점수를 계산합니다.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "핸드를 제출할 수 없습니다.");
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
      return;
    }
    audio.playEffect("card-play", { playbackRate: 1.12, gain: 0.86 });
  }

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || settingsOpen || utilityModal || pendingSellId || pendingStartMode || syncConflict) return;
      if (event.key === "?") {
        event.preventDefault();
        setUtilityModal("shortcuts");
        return;
      }
      if (view !== "game" || !run || run.phase !== "playing" || scorePlayback || discardPlayback) return;
      const activeHandOrder = handOrder.scope === `${run.runId}:${run.roundNumber}`
        ? handOrder.ids
        : [];
      const displayHand = orderHand(run.hand, activeHandOrder);
      if (/^[0-9]$/.test(event.key)) {
        const shortcutIndex = event.key === "0" ? 9 : Number(event.key) - 1;
        const card = displayHand[shortcutIndex];
        if (!card) return;
        event.preventDefault();
        setSelectedIds((current) => current.includes(card.id)
          ? current.filter((id) => id !== card.id)
          : current.length < 5 ? [...current, card.id] : current);
        return;
      }
      const key = event.key.toLowerCase();
      if (event.key === "Enter") {
        event.preventDefault();
        document.getElementById("play-hand-button")?.click();
      } else if (key === "d") {
        event.preventDefault();
        document.getElementById("discard-button")?.click();
      } else if (key === "s") {
        event.preventDefault();
        const next = nextShortcutSortRef.current;
        const scope = `${run.runId}:${run.roundNumber}`;
        setHandOrder((current) => ({
          scope,
          ids: sortHandOnce(run.hand, current.scope === scope ? current.ids : [], next),
        }));
        nextShortcutSortRef.current = next === "rank" ? "color" : "rank";
      } else if (key === "u" && !run.unoUsedThisAnte && run.communityUno.length > 0) {
        event.preventDefault();
        setSelectedUnoId((current) => current ? null : run.communityUno[0].id);
      } else if (key === "h") {
        event.preventDefault();
        setUtilityModal("hands");
      } else if (key === "k") {
        event.preventDefault();
        setUtilityModal("deck");
      } else if (event.key === "Escape" && selectedIds.length > 0) {
        setSelectedIds([]);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [discardPlayback, handOrder, pendingSellId, pendingStartMode, run, scorePlayback, selectedIds.length, settingsOpen, syncConflict, utilityModal, view]);

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
    roundLabel: ROUND_LABEL[run.round],
    score: run.score,
    target: run.target,
    mode: run.mode,
  } : null;

  const navItems: Array<{ id: View; label: string; icon: string }> = [
    { id: "lobby", label: "홈", icon: "⌂" },
    { id: "game", label: "플레이", icon: "◇" },
    { id: "community", label: "메이헴 연구소", icon: "M" },
    { id: "leaderboard", label: "랭킹", icon: "#" },
    { id: "guestbook", label: "평가", icon: "★" },
  ];
  const immersiveView = view === "lobby"
    || (view === "game" && (!run || run.phase === "playing" || run.phase === "shop" || Boolean(scorePlayback)));

  return (
    <div className={`app-shell${immersiveView ? " is-immersive" : ""}${highContrast ? " high-contrast" : ""}${reducedMotion ? " reduced-motion" : ""}`}>
      <header className="topbar">
        <button type="button" className="brand" onClick={() => setView("lobby")} aria-label="DECK MAYHEM 홈">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><b>DECK <span>MAYHEM</span></b>
        </button>
        <nav className="topnav" aria-label="주 메뉴">
          {navItems.map((item) => <button type="button" key={item.id} className={`nav-button${view === item.id ? " active" : ""}`} onClick={() => item.id !== "game" || run ? setView(item.id) : requestStartRun("standard")}>{item.label}</button>)}
        </nav>
        <div className="top-actions">
          <span className={`online-pill${online ? "" : " offline"}`}><i />{online ? "온라인" : "오프라인"}</span>
          <button type="button" className="icon-button" aria-label={audio.musicEnabled ? "음악 끄기" : "음악 켜기"} onClick={audio.toggleMusic}>{audio.musicEnabled ? "♪" : "♩"}</button>
          <button type="button" className="icon-button" aria-label="키보드 단축키" onClick={() => setUtilityModal("shortcuts")}>?</button>
          <button type="button" className="icon-button profile-button" onClick={() => setSettingsOpen(true)}><i>{initialUser?.displayName.slice(0, 1) ?? "게"}</i><span>{initialUser?.displayName ?? "게스트"}</span></button>
        </div>
      </header>

      {view === "lobby" && <Lobby savedRun={summary} equippedUno={equippedUno} signedIn={signedIn} onContinue={() => setView("game")} onStart={requestStartRun} onOpenCommunity={() => setView("community")} onOpenGuide={() => setUtilityModal("hands")} onOpenSettings={() => setSettingsOpen(true)} onOpenLeaderboard={() => setView("leaderboard")} onOpenGuestbook={() => setView("guestbook")} />}
      {view === "community" && <CommunityHub signedIn={signedIn} equippedId={equippedUno?.id} onEquip={(card) => { setEquippedUno(card); setLocalSetting("equippedCommunityUno", card).catch(() => undefined); setNotice(`${card.name} 카드를 다음 런의 첫 상점에 예약했습니다.`); }} />}
      {view === "leaderboard" && <LeaderboardView />}
      {view === "guestbook" && <GuestbookView signedIn={signedIn} />}
      {view === "game" && !run && <Lobby savedRun={null} equippedUno={equippedUno} signedIn={signedIn} onContinue={() => requestStartRun("standard")} onStart={requestStartRun} onOpenCommunity={() => setView("community")} onOpenGuide={() => setUtilityModal("hands")} onOpenSettings={() => setSettingsOpen(true)} onOpenLeaderboard={() => setView("leaderboard")} onOpenGuestbook={() => setView("guestbook")} />}
      {view === "game" && run && (run.phase === "playing" || scorePlayback) && (
        <GameTable
          run={run}
          selectedIds={selectedIds}
          selectedUnoId={selectedUnoId}
          calledColor={calledColor}
          lastBreakdown={lastBreakdown}
          scorePlayback={scorePlayback}
          discardPlayback={discardPlayback}
          displayRoundScore={displayRoundScore}
          transferRemainingScore={transferRemainingScore}
          notice={notice}
          handOrderIds={handOrder.scope === `${run.runId}:${run.roundNumber}` ? handOrder.ids : []}
          onToggleCard={handleToggleCard}
          onSelectUno={setSelectedUnoId}
          onCallColor={setCalledColor}
          onSort={changeSort}
          onClear={() => setSelectedIds([])}
          onOpenGuide={() => setUtilityModal("hands")}
          onOpenDeck={() => setUtilityModal("deck")}
          onOpenShortcuts={() => setUtilityModal("shortcuts")}
          onOpenLobby={() => setView("lobby")}
          onOpenSettings={() => setSettingsOpen(true)}
          onPlay={handlePlay}
          onDiscard={handleDiscard}
          onHotSwap={(color) => {
            if (scorePlayback || discardPlayback) return;
            updateRun(() => setHotSwapColor(run, color));
          }}
        />
      )}
      {view === "game" && run?.phase === "shop" && !scorePlayback && <ShopView run={run} notice={notice} onBuy={(offer) => { if (updateRun(() => buyShopOffer(run, offer.id))) audio.playEffect("buy"); }} onReroll={() => updateRun(() => rerollShop(run))} onSell={setPendingSellId} onNext={() => { if (updateRun(() => nextRound(run))) audio.playEffect("card-draw"); setLastBreakdown(null); setSelectedIds([]); }} onOpenLobby={() => setView("lobby")} onOpenSettings={() => setSettingsOpen(true)} />}
      {view === "game" && run && !scorePlayback && (run.phase === "won" || run.phase === "lost") && <ResultView run={run} notice={notice} signedIn={signedIn} onRank={submitRank} onRestart={() => startRun(run.mode)} onLobby={() => setView("lobby")} />}

      <nav className="mobile-nav" aria-label="모바일 메뉴">{navItems.map((item) => <button type="button" key={item.id} className={view === item.id ? "active" : ""} onClick={() => item.id !== "game" || run ? setView(item.id) : requestStartRun("standard")}><b>{item.icon}</b>{item.label}</button>)}</nav>
      {notice && view !== "game" && <div className="global-notice" role="status">{notice}</div>}
      {loadingSave && <div className="loading-save" role="status">저장된 런 확인 중…</div>}
      {settingsOpen && <SettingsModal user={initialUser} online={online} audio={audio} highContrast={highContrast} reducedMotion={reducedMotion} onHighContrast={(value) => { setHighContrast(value); setLocalSetting("highContrast", value).catch(() => undefined); }} onReducedMotion={(value) => { setReducedMotion(value); setLocalSetting("reducedMotion", value).catch(() => undefined); }} onClose={() => setSettingsOpen(false)} />}
      {utilityModal === "hands" && <HandGuide handLevels={run?.handLevels ?? BASE_HAND_LEVELS} onClose={() => setUtilityModal(null)} />}
      {utilityModal === "deck" && run && <DeckInspector drawPile={run.drawPile} discardPile={run.discardPile} hand={run.hand} onClose={() => setUtilityModal(null)} />}
      {utilityModal === "shortcuts" && <ShortcutGuide onClose={() => setUtilityModal(null)} />}
      {pendingSellId && run && (() => {
        const owned = run.jokers.find((joker) => joker.instanceId === pendingSellId);
        if (!owned) return null;
        const definition = JOKER_CATALOG[owned.jokerId];
        const refund = Math.max(1, Math.floor(definition.price / 2));
        return <Modal title="조커 판매" onClose={() => setPendingSellId(null)}><div className="confirm-body"><div className="confirm-joker"><span>{definition.name.slice(0, 1)}</span><div><b>{definition.name}</b><small>{definition.description}</small></div></div><p>이 조커를 판매하고 <strong>{refund}¢</strong>를 받을까요?</p><div className="confirm-actions"><button type="button" className="secondary-button" onClick={() => setPendingSellId(null)}>취소</button><button type="button" className="primary-button" onClick={() => { if (updateRun(() => sellJoker(run, pendingSellId))) audio.playEffect("buy"); setPendingSellId(null); }}>판매 +{refund}¢</button></div></div></Modal>;
      })()}
      {pendingStartMode && run && <Modal title="새 런 시작" onClose={() => setPendingStartMode(null)}><div className="confirm-body"><p>진행 중인 <strong>{run.mode === "standard" ? "5 앤티" : "무한"} 런</strong> 대신 새 {pendingStartMode === "standard" ? "5 앤티" : "무한"} 런을 시작할까요?</p><div className="conflict-card"><span>현재 진행</span><b>앤티 {run.ante} · {ROUND_LABEL[run.round]}</b><small>{run.score.toLocaleString()} / {run.target.toLocaleString()}점</small></div><div className="confirm-actions"><button type="button" className="secondary-button" onClick={() => setPendingStartMode(null)}>현재 런 계속</button><button type="button" className="primary-button" onClick={() => { const mode = pendingStartMode; setPendingStartMode(null); startRun(mode); }}>새 런 시작</button></div></div></Modal>}
      {syncConflict && <Modal title="진행 상황 충돌" onClose={() => setSyncConflict(null)} wide><div className="confirm-body"><p>다른 기기에서 같은 모드의 런이 업데이트되었습니다. 자동으로 덮어쓰지 않고 선택을 기다립니다.</p><div className="conflict-grid"><div className="conflict-card"><span>이 기기</span><b>앤티 {syncConflict.local.ante} · {ROUND_LABEL[syncConflict.local.round]}</b><small>{syncConflict.local.stats.totalScore.toLocaleString()} 누적점</small></div><div className="conflict-card remote"><span>클라우드 · {new Date(syncConflict.remoteUpdatedAt).toLocaleString("ko-KR")}</span><b>앤티 {syncConflict.remote.ante} · {ROUND_LABEL[syncConflict.remote.round]}</b><small>{syncConflict.remote.stats.totalScore.toLocaleString()} 누적점</small></div></div><div className="confirm-actions"><button type="button" className="secondary-button" onClick={() => { const conflict = syncConflict; cloudRevision.current[conflict.remote.mode] = conflict.remoteRevision; replaceRun(conflict.remote); setSyncConflict(null); setNotice("클라우드 진행을 불러왔습니다."); }}>클라우드 불러오기</button><button type="button" className="primary-button" onClick={() => { const conflict = syncConflict; cloudRevision.current[conflict.local.mode] = conflict.remoteRevision; setSyncConflict(null); syncCloudRun(conflict.local).then(() => setNotice("이 기기의 진행으로 클라우드를 갱신했습니다.")).catch((cause) => setNotice(cause instanceof Error ? cause.message : "동기화에 실패했습니다.")); }}>이 기기 진행 유지</button></div></div></Modal>}
    </div>
  );
}

function GameTable({
  run,
  selectedIds,
  selectedUnoId,
  calledColor,
  lastBreakdown,
  scorePlayback,
  discardPlayback,
  displayRoundScore,
  transferRemainingScore,
  notice,
  handOrderIds,
  onToggleCard,
  onSelectUno,
  onCallColor,
  onSort,
  onClear,
  onOpenGuide,
  onOpenDeck,
  onOpenShortcuts,
  onOpenLobby,
  onOpenSettings,
  onPlay,
  onDiscard,
  onHotSwap,
}: {
  run: RunState;
  selectedIds: string[];
  selectedUnoId: string | null;
  calledColor: CardColor;
  lastBreakdown: ScoreBreakdown | null;
  scorePlayback: ScorePlayback | null;
  discardPlayback: DiscardPlayback | null;
  displayRoundScore: number;
  transferRemainingScore?: number;
  notice: string;
  handOrderIds: readonly string[];
  onToggleCard: (id: string) => void;
  onSelectUno: (id: string | null) => void;
  onCallColor: (color: CardColor) => void;
  onSort: (sort: HandSort) => void;
  onClear: () => void;
  onOpenGuide: () => void;
  onOpenDeck: () => void;
  onOpenShortcuts: () => void;
  onOpenLobby: () => void;
  onOpenSettings: () => void;
  onPlay: () => void;
  onDiscard: () => void;
  onHotSwap: (color: CardColor) => void;
}) {
  const currentScoreEvent = scorePlayback && scorePlayback.phase !== "moving"
    ? scorePlayback.events[scorePlayback.eventIndex] ?? null
    : null;
  const selectedCards = selectedIds
    .map((id) => run.hand.find((card) => card.id === id))
    .filter((card): card is GameCard => Boolean(card));
  const selectedHandName = selectedCards.length > 0
    ? HAND_RULES[evaluateHand(selectedCards).type].name
    : null;
  const shown = selectedHandName
    ? null
    : scorePlayback
      ? currentScoreEvent ? scorePlayback.breakdown : null
      : lastBreakdown;
  const resolvingScore = Boolean(scorePlayback);
  const inputLocked = resolvingScore || Boolean(discardPlayback);
  const hotSwap = run.jokers.find((joker) => joker.jokerId === "hot-swap");
  const cardsLeftInHand = scorePlayback
    ? scorePlayback.handBefore.filter((card) => !scorePlayback.cards.some((played) => played.id === card.id))
    : run.hand;
  const displayHand = orderHand(cardsLeftInHand, handOrderIds);
  const scorePhase = scorePlayback?.phase
    ?? (discardPlayback ? "direct-discard" : selectedHandName ? "selecting" : "idle");
  const displayedDrawPile = scorePlayback?.drawPileBefore ?? run.drawPile;
  const displayedDiscardPile = scorePlayback?.discardPileBefore ?? run.discardPile;
  const referenceHand = scorePlayback?.handBefore ?? run.hand;
  const deckReferenceCards = useMemo(
    () => [...displayedDrawPile, ...displayedDiscardPile, ...referenceHand],
    [displayedDiscardPile, displayedDrawPile, referenceHand],
  );
  return (
    <main
      className={`game-view balatro-mobile-game deck-game-view${resolvingScore ? " is-resolving-score" : ""}${discardPlayback ? " is-discarding-hand" : ""}`}
      data-score-phase={scorePhase}
      aria-busy={inputLocked}
    >
      <div className="rotate-hint" role="note"><span aria-hidden="true">↻</span> 가로 화면에서 카드 테이블을 더 넓게 볼 수 있어요.</div>
      <div className="mobile-game-shell deck-game-shell">
        <GameLeftRail
          run={run}
          breakdown={shown}
          scoreEvent={currentScoreEvent}
          displayRoundScore={displayRoundScore}
          transferRemainingScore={transferRemainingScore}
          isResolving={resolvingScore}
          isTransferring={scorePlayback?.phase === "transferring"}
          scorePhase={scorePhase}
          previewHandName={selectedHandName}
          showingLastHand={!scorePlayback && !selectedHandName && Boolean(lastBreakdown)}
          onOpenHandGuide={onOpenGuide}
          onOpenDeckInspector={onOpenDeck}
          onOpenShortcutGuide={onOpenShortcuts}
          onOpenLobby={onOpenLobby}
          onOpenSettings={onOpenSettings}
        >
          {hotSwap && run.handHistory.length === 0 ? <ColorPicker value={hotSwap.selectedColor ?? "red"} disabled={inputLocked} onChange={onHotSwap} /> : null}
        </GameLeftRail>

        <section className="felt-table play-felt deck-play-table" aria-label="카드 플레이 테이블">
          <div className="felt-watermark" aria-hidden="true"><i /><i /><i /><i /></div>

          <header className="deck-stage-header">
            <div><span>플레이 공간</span><strong>DECK MAYHEM</strong></div>
            <p role="status" aria-live="polite">{notice || (selectedIds.length ? `${selectedIds.length}/5 카드 선택됨` : "카드를 선택해 조합을 만드세요")}</p>
          </header>

          <ModifierRail run={run} breakdown={shown} className="deck-modifier-rail" />

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
                {currentScoreEvent && (
                  <output className={`deck-score-event deck-score-event-${currentScoreEvent.emphasis}`} key={currentScoreEvent.id}>
                    <span>{currentScoreEvent.type === "hand-detected" ? "족보 확정" : currentScoreEvent.label}</span>
                    <strong>{formatScoreEventValue(currentScoreEvent)}</strong>
                    <small>{currentScoreEvent.description}</small>
                    <i>{currentScoreEvent.currentTotal.toLocaleString()}</i>
                  </output>
                )}
                <div className={`deck-score-particles deck-score-particles-${currentScoreEvent?.emphasis ?? "subtle"}`} aria-hidden="true">
                  {Array.from({ length: 8 }, (_, index) => <i key={index} />)}
                </div>
              </>
            ) : (
              <div className="deck-resolve-idle">
                <span aria-hidden="true">◇</span>
                <strong>제출 영역</strong>
                <small>제출한 카드는 계산이 끝날 때까지 이곳에 남습니다.</small>
              </div>
            )}
          </section>

          <aside className="deck-pile-dock" aria-label="뽑기 더미와 버린 카드 더미">
            <PileInspector variant="draw" cards={displayedDrawPile} referenceCards={deckReferenceCards} totalCards={deckReferenceCards.length} onOpenDetails={onOpenDeck} disabled={inputLocked} />
            <PileInspector variant="discard" cards={displayedDiscardPile} totalCards={deckReferenceCards.length} onOpenDetails={onOpenDeck} disabled={inputLocked} />
          </aside>

          {selectedUnoId && !inputLocked && <section className="table-uno-popover deck-color-link" aria-label="특수 카드 호출 색 선택"><div><b>색상 연결</b><small>득점 카드마다 +2칩</small></div><ColorPicker value={calledColor} onChange={onCallColor} /></section>}

          <section className="table-hand-stage deck-hand-stage" aria-label="손패와 행동">
            <div className="deck-hand-meta">
              <section className={`deck-effect-quickbar${run.unoUsedThisAnte ? " is-used" : ""}`} aria-label="사용할 메이헴 카드 선택">
                <header><span>메이헴 카드</span><b>{run.unoUsedThisAnte ? "사용함" : "앤티당 1회"}</b></header>
                <div>
                  {run.communityUno.length ? run.communityUno.map((card) => {
                    const modules = [...card.positiveModules, ...card.negativeModules].map((id) => UNO_MODULE_CATALOG[id].name).join(" · ");
                    return <button type="button" key={card.id} disabled={run.unoUsedThisAnte || inputLocked} className={selectedUnoId === card.id ? "active" : ""} aria-label={`${card.name}, ${card.author} 제작, ${modules}`} aria-pressed={selectedUnoId === card.id} onClick={() => onSelectUno(selectedUnoId === card.id ? null : card.id)}><span aria-hidden="true">M</span><b>{card.name}</b><small>{selectedUnoId === card.id ? ({ red: "빨강", blue: "파랑", green: "초록", yellow: "노랑" } as const)[calledColor] : "준비"}</small></button>;
                  }) : <span className="deck-effect-empty">빈 슬롯</span>}
                </div>
              </section>
              <div className="table-hand-tools selection-tools">
                <button type="button" disabled={inputLocked || selectedIds.length === 0} onClick={onClear}><kbd>ESC</kbd><span>해제</span></button>
                <output>{selectedIds.length}/5</output>
              </div>
            </div>
            <HandView cards={displayHand} selectedIds={selectedIds} discardingIds={discardPlayback?.cardIds ?? []} resolving={inputLocked} onToggleCard={onToggleCard} />
            <div className="table-action-dock">
              <button id="play-hand-button" type="button" className="table-action play-action" disabled={inputLocked || !selectedIds.length} onClick={onPlay}><kbd>↵</kbd><span>{resolvingScore ? "점수 계산" : "내기"}</span></button>
              <SortControl disabled={inputLocked} onChange={onSort} />
              <button id="discard-button" type="button" className="table-action discard-action" disabled={inputLocked || !selectedIds.length || run.discardsLeft < 1} onClick={onDiscard}><kbd>D</kbd><span>{discardPlayback ? "버리는 중" : "버리기"}</span></button>
            </div>
          </section>
        </section>
      </div>
    </main>
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
  const labels: Record<CardColor, { name: string; short: string }> = {
    red: { name: "빨강", short: "R" },
    blue: { name: "파랑", short: "B" },
    green: { name: "초록", short: "G" },
    yellow: { name: "노랑", short: "Y" },
  };
  return <div className="color-call" role="group" aria-label="호출할 색">{CARD_COLORS.map((color) => <button type="button" key={color} disabled={disabled} className={`${color}${value === color ? " active" : ""}`} aria-label={`${labels[color].name} 선택`} aria-pressed={value === color} onClick={() => onChange(color)}><span>{labels[color].short}</span></button>)}</div>;
}

function JokerRack({ run, onSell }: { run: RunState; onSell?: (id: string) => void }) {
  return <div className="joker-rack"><div className="joker-rack-label"><b>조커</b><small>{run.jokers.length} / 4</small></div>{run.jokers.map((joker) => { const definition = JOKER_CATALOG[joker.jokerId]; const refund = Math.max(1, Math.floor(definition.price / 2)); return <article className={`joker-slot joker-${definition.rarity}`} key={joker.instanceId} title={definition.description}><span className="joker-slot-art" aria-hidden="true"><i>{definition.name.slice(0,1)}</i></span><div><b>{definition.name}</b><small>{definition.description}</small></div>{onSell && <button type="button" className="joker-sell" aria-label={`${definition.name} 판매`} onClick={() => onSell(joker.instanceId)}>판매 {refund}¢</button>}</article>; })}{Array.from({ length: Math.max(0, 4-run.jokers.length) }, (_, index) => <div className="joker-slot empty" aria-label={`빈 조커 슬롯 ${index + 1}`} key={`empty-${index}`}>+</div>)}</div>;
}

function ShopView({ run, notice, onBuy, onReroll, onSell, onNext, onOpenLobby, onOpenSettings }: { run: RunState; notice: string; onBuy: (offer: ShopOffer) => void; onReroll: () => void; onSell: (id: string) => void; onNext: () => void; onOpenLobby: () => void; onOpenSettings: () => void }) {
  const offerCount = run.shop?.offers.length ?? 0;
  const nextLabel = run.round === "boss" ? `앤티 ${run.ante + 1}` : ROUND_LABEL[ROUND_ORDER[ROUND_ORDER.indexOf(run.round) + 1]];
  return <main className="shop-view balatro-mobile-shop">
    <div className="rotate-hint" role="note"><span aria-hidden="true">↻</span> 가로 화면에서 상점 전체를 한눈에 볼 수 있어요.</div>
    <div className="mobile-shop-shell">
      <aside className="shop-mobile-rail" aria-label="상점 정보와 행동">
        <header className="shop-pixel-sign"><span>★</span><strong>상점</strong><small>런을 강화하세요</small></header>
        <section className="shop-rail-score"><span>라운드 점수</span><b>{run.score.toLocaleString()}</b><small>앤티 {run.ante} · {ROUND_LABEL[run.round]}</small></section>
        <section className="shop-rail-wallet"><span>보유 금액</span><strong>{run.coins}¢</strong></section>
        <dl className="shop-rail-slots"><div><dt>조커</dt><dd>{run.jokers.length}/{JOKER_SLOT_LIMIT}</dd></div><div><dt>메이헴</dt><dd>{run.communityUno.length}/{UNO_SLOT_LIMIT}</dd></div><div><dt>상품</dt><dd>{offerCount}</dd></div></dl>
        <nav className="shop-rail-tools" aria-label="상점 메뉴"><button type="button" onClick={onOpenLobby}>⌂ <span>로비</span></button><button type="button" onClick={onOpenSettings}>⚙ <span>옵션</span></button></nav>
        <div className="shop-rail-actions"><button type="button" disabled={!run.shop || run.coins < run.shop.rerollCost} onClick={onReroll}>리롤 <b>{run.shop?.rerollCost ?? 0}¢</b></button><button type="button" onClick={onNext}>다음 <b>{nextLabel}</b></button></div>
      </aside>

      <section className="felt-table shop-felt" aria-label="컬러 마켓 진열대">
        <div className="felt-watermark" aria-hidden="true"><i /><i /><i /><i /></div>
        <section className="shop-owned-tray" aria-labelledby="shop-owned-title"><header><h2 id="shop-owned-title">보유 조커</h2><span>탭해서 판매</span></header><JokerRack run={run} onSell={onSell} /></section>
        <section className="shop-window" aria-labelledby="shop-window-title">
          <header><div><span>라운드 클리어</span><h1 id="shop-window-title">컬러 마켓</h1></div><p role="status" aria-live="polite">{notice || "다음 라운드를 위한 빌드를 완성하세요."}</p></header>
          <div className="shop-shelf">{run.shop?.offers.map((offer) => <ShopOfferCard key={offer.id} offer={offer} run={run} onBuy={() => onBuy(offer)} />)}</div>
          {offerCount === 0 && <div className="shop-empty"><b>품절</b><span>리롤하거나 다음 라운드로 이동하세요.</span></div>}
        </section>
        <div className="shop-table-deck" aria-hidden="true"><div className="pile-card back"><i>◇</i></div><strong>{run.drawPile.length || 40}</strong></div>
      </section>
    </div>
  </main>;
}

function ShopOfferCard({ offer, run, onBuy }: { offer: ShopOffer; run: RunState; onBuy: () => void }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  let eyebrow = "조커"; let name = ""; let description = ""; let symbol = "?";
  let disabledReason = run.coins < offer.price ? `${offer.price - run.coins}¢ 부족` : "";
  if (offer.kind === "joker") { const definition = JOKER_CATALOG[offer.jokerId]; const rarity = { common: "일반", uncommon: "고급", rare: "희귀" } as const; eyebrow = `${rarity[definition.rarity]} 조커`; name = definition.name; description = definition.description; symbol = name.slice(0,1); if (run.jokers.some((joker) => joker.jokerId === offer.jokerId)) disabledReason = "이미 보유 중"; else if (run.jokers.length >= JOKER_SLOT_LIMIT) disabledReason = "조커 슬롯 가득 참"; }
  if (offer.kind === "hand-upgrade") { const rule = HAND_RULES[offer.handType]; const level = run.handLevels[offer.handType]; eyebrow = "족보 강화"; name = `${rule.name} 레벨 ${level} → ${level + 1}`; description = `기본 칩 +${rule.chipsPerLevel}, 배수 +${rule.multiplierPerLevel}`; symbol = "↑"; }
  if (offer.kind === "community-uno") { eyebrow = "메이헴 카드"; name = offer.card.name; description = `${offer.card.author} 제작 · 앤티당 한 번 사용할 수 있습니다.`; symbol = "M"; }
  if (offer.kind === "community-uno") { if (run.communityUno.some((card) => card.id === offer.card.id)) disabledReason = "이미 보유 중"; else if (run.communityUno.length >= UNO_SLOT_LIMIT) disabledReason = "효과 카드 슬롯 가득 참"; }
  const moduleIds = offer.kind === "community-uno" ? [...offer.card.positiveModules, ...offer.card.negativeModules] : [];
  return <article className={`shop-card shop-${offer.kind}${disabledReason ? " unavailable" : ""}${detailsOpen ? " is-details-open" : ""}`}><div><span className="kicker">{eyebrow}</span><button type="button" className="shop-info-button" aria-label={`${name} 상세 정보 ${detailsOpen ? "닫기" : "보기"}`} aria-expanded={detailsOpen} onBlur={() => setDetailsOpen(false)} onClick={(event) => { const nextOpen = !detailsOpen; setDetailsOpen(nextOpen); if (!nextOpen) event.currentTarget.blur(); }}>i</button><div className="shop-type-art">{symbol}</div><h3>{name}</h3><p className="shop-card-summary">{description}</p><div className="shop-card-tooltip" role="tooltip"><strong>{name}</strong><p>{description}</p>{disabledReason && <small>{disabledReason}</small>}{moduleIds.length > 0 && <ul>{moduleIds.map((id) => <li key={id} className={UNO_MODULE_CATALOG[id].kind}>{UNO_MODULE_CATALOG[id].points > 0 ? "+" : ""}{UNO_MODULE_CATALOG[id].points} · {UNO_MODULE_CATALOG[id].name}<br />{UNO_MODULE_CATALOG[id].description.replace(/UNO/g, "메이헴")}</li>)}</ul>}</div></div><footer><b>{offer.price} ¢</b><button type="button" className="small-action" disabled={Boolean(disabledReason)} onClick={onBuy}>{disabledReason || "구매"}</button></footer></article>;
}

function ResultView({ run, notice, signedIn, onRank, onRestart, onLobby }: { run: RunState; notice: string; signedIn: boolean; onRank: () => void; onRestart: () => void; onLobby: () => void }) {
  const won = run.phase === "won";
  return <main className="result-view"><section className="result-card"><div className="result-symbol">{won ? "✓" : "×"}</div><span className="kicker">{won ? "신호 연결 완료" : "연결 종료"}</span><h1>{won ? "메이헴 완주!" : "런 종료"}</h1><p>{won ? "5개의 앤티를 모두 돌파했습니다." : `앤티 ${run.ante} · ${ROUND_LABEL[run.round]}에서 신호가 끊겼습니다.`}</p><div className="result-stats"><div><span>누적 점수</span><b>{run.stats.totalScore.toLocaleString()}</b></div><div><span>최고 핸드</span><b>{run.stats.highestHandScore.toLocaleString()}</b></div><div><span>메이헴 사용</span><b>{run.stats.unoUses}</b></div></div>{notice && <div className="status-strip">{notice}</div>}<div className="result-actions"><button type="button" className="secondary-button" onClick={onLobby}>로비로</button><button type="button" className="secondary-button" onClick={onRestart}>같은 모드 재도전</button><button type="button" className="primary-button" disabled={!signedIn} onClick={onRank}>{signedIn ? "공식 기록 제출" : "로그인 후 기록 제출"}</button></div></section></main>;
}

function SettingsModal({ user, online, audio, highContrast, reducedMotion, onHighContrast, onReducedMotion, onClose }: { user: InitialUser | null; online: boolean; audio: ReturnType<typeof useGameAudio>; highContrast: boolean; reducedMotion: boolean; onHighContrast: (value: boolean) => void; onReducedMotion: (value: boolean) => void; onClose: () => void }) {
  return <Modal title="설정과 계정" onClose={onClose}><div className="settings-body"><section><span className="kicker">계정</span><div className="account-card"><i>{user?.displayName.slice(0,1) ?? "게"}</i><div><b>{user?.displayName ?? "게스트 플레이어"}</b><small>{user?.email ?? "기기 안에만 진행 상황을 저장합니다."}</small></div><a href={user ? "/signout-with-chatgpt?return_to=%2F" : "/signin-with-chatgpt?return_to=%2F"}>{user ? "로그아웃" : "로그인"}</a></div><p className="settings-help">{user ? "클라우드 저장이 활성화되어 다른 기기에서 로그인해 이어할 수 있습니다." : "로그인하면 런, 제작 카드, 방명록과 랭킹 기록을 계정에 연결합니다."}</p></section><section><span className="kicker">접근성</span><div className="setting-row"><span><b>고대비 모드</b><small>패널과 텍스트의 대비를 높입니다.</small></span><button type="button" role="switch" aria-checked={highContrast} aria-label="고대비 모드" className={`toggle${highContrast ? " on" : ""}`} onClick={() => onHighContrast(!highContrast)}><i /></button></div><div className="setting-row"><span><b>모션 줄이기</b><small>점수 팝업과 카드 이동 애니메이션을 줄입니다.</small></span><button type="button" role="switch" aria-checked={reducedMotion} aria-label="모션 줄이기" className={`toggle${reducedMotion ? " on" : ""}`} onClick={() => onReducedMotion(!reducedMotion)}><i /></button></div></section><section><span className="kicker">오디오</span><div className="setting-row"><span><b>배경 음악</b><small>런과 보스 장면별 배경음</small></span><button type="button" role="switch" aria-checked={audio.musicEnabled} aria-label="배경 음악" className={`toggle${audio.musicEnabled ? " on" : ""}`} onClick={audio.toggleMusic}><i /></button></div><label className="range-label" htmlFor="music-volume">배경 음악 볼륨</label><input id="music-volume" type="range" min="0" max="1" step="0.05" value={audio.musicVolume} onChange={(event) => audio.setMusicVolume(Number(event.target.value))} /><div className="setting-row"><span><b>효과음</b><small>카드, 점수, 상점 효과</small></span><button type="button" role="switch" aria-checked={audio.effectsEnabled} aria-label="효과음" className={`toggle${audio.effectsEnabled ? " on" : ""}`} onClick={audio.toggleEffects}><i /></button></div><label className="range-label" htmlFor="effects-volume">효과음 볼륨</label><input id="effects-volume" type="range" min="0" max="1" step="0.05" value={audio.effectsVolume} onChange={(event) => audio.setEffectsVolume(Number(event.target.value))} /></section><section><span className="kicker">동기화</span><div className="setting-row"><span><b>{online ? "온라인 연결됨" : "오프라인 플레이 중"}</b><small>{online ? "대기 중인 작업을 자동으로 전송합니다." : "진행과 제작 카드를 기기에 안전하게 보관합니다."}</small></span><i className={online ? "sync-light on" : "sync-light"} /></div></section></div></Modal>;
}
