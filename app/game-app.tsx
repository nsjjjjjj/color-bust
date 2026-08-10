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
import {
  CARD_COLORS,
  DEFAULT_COMMUNITY_UNO_CARDS,
  HAND_RULES,
  JOKER_SLOT_LIMIT,
  JOKER_CATALOG,
  ROUND_ORDER,
  UNO_SLOT_LIMIT,
  UNO_MODULE_CATALOG,
  rankChipValue,
} from "../lib/game/constants";
import { recommendBestHand } from "../lib/game/advisor";
import { calculateHandScore } from "../lib/game/scoring";
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
import { ColorCard } from "./components/color-card";
import { CommunityHub } from "./components/community-hub";
import { DeckInspector, HandGuide, ShortcutGuide } from "./components/game-reference";
import { GameLeftRail } from "./components/game-side-panels";
import { Lobby, type RunSummary } from "./components/lobby";
import { Modal } from "./components/modal";
import { GuestbookView, LeaderboardView } from "./components/social-views";
import { useGameAudio } from "./use-game-audio";

type View = "lobby" | "game" | "community" | "leaderboard" | "guestbook";
type UtilityModal = "hands" | "deck" | "shortcuts" | null;
type CardSort = "dealt" | "rank" | "color";
type InitialUser = Pick<UserProfile, "displayName" | "email"> & { userId?: string };
type SyncConflict = {
  local: RunState;
  remote: RunState;
  remoteRevision: number;
  remoteUpdatedAt: string;
};

const COLOR_ORDER: Record<CardColor, number> = { red: 0, blue: 1, green: 2, yellow: 3 };
const CARD_SORTS: readonly CardSort[] = ["dealt", "rank", "color"];
const CARD_SORT_LABEL: Record<CardSort, string> = {
  dealt: "받은 순서",
  rank: "숫자순",
  color: "색상순",
};
const BASE_HAND_LEVELS = Object.fromEntries(
  Object.keys(HAND_RULES).map((handType) => [handType, 1]),
) as RunState["handLevels"];

const ROUND_LABEL: Record<RunState["round"], string> = {
  small: "SMALL BLIND",
  big: "BIG BLIND",
  boss: "BOSS BLIND",
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

function sortHand(hand: readonly GameCard[], sort: CardSort): GameCard[] {
  if (sort === "dealt") return [...hand];
  return [...hand].sort((left, right) => {
    if (sort === "rank") {
      return left.rank - right.rank || COLOR_ORDER[left.color] - COLOR_ORDER[right.color];
    }
    return COLOR_ORDER[left.color] - COLOR_ORDER[right.color] || left.rank - right.rank;
  });
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
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
  const [cardSort, setCardSort] = useState<CardSort>("dealt");
  const [highContrast, setHighContrast] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pendingSellId, setPendingSellId] = useState<string | null>(null);
  const [pendingStartMode, setPendingStartMode] = useState<"standard" | "endless" | null>(null);
  const [syncConflict, setSyncConflict] = useState<SyncConflict | null>(null);
  const [scoreBurst, setScoreBurst] = useState<{ key: number; breakdown: ScoreBreakdown } | null>(null);
  const [notice, setNotice] = useState("");
  const [loadingSave, setLoadingSave] = useState(true);
  const cloudRevision = useRef<Record<"standard" | "endless", number>>({ standard: 0, endless: 0 });
  const latestRunRef = useRef<RunState | null>(null);

  const audioScene = view === "game" && run?.round === "boss" ? "boss" : view === "game" ? "run" : "menu";
  const audio = useGameAudio(audioScene);
  const signedIn = Boolean(initialUser);

  useEffect(() => {
    latestRunRef.current = run;
  }, [run]);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const [localRuns, savedUno, savedSort, savedContrast, savedMotion] = await Promise.all([
        listLocalRuns<RunState>().catch(() => []),
        getLocalSetting<CommunityUnoCard | undefined>("equippedCommunityUno", undefined).catch(() => undefined),
        getLocalSetting<CardSort>("handSort", "dealt").catch(() => "dealt" as const),
        getLocalSetting<boolean>("highContrast", false).catch(() => false),
        getLocalSetting<boolean>("reducedMotion", false).catch(() => false),
      ]);
      if (cancelled) return;
      setEquippedUno(savedUno);
      setCardSort(CARD_SORTS.includes(savedSort) ? savedSort : "dealt");
      setHighContrast(savedContrast);
      setReducedMotion(savedMotion);
      const local = localRuns.find((record) => isRunState(record.data) && record.data.phase !== "won" && record.data.phase !== "lost");
      if (local) setRun(local.data);

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
          setRun(latestRemote.snapshot);
          setNotice("다른 기기의 최신 진행을 불러왔습니다.");
        }
      }
      setLoadingSave(false);
    }
    restore();
    return () => { cancelled = true; };
  }, [signedIn]);

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
    if (!scoreBurst) return;
    const timer = window.setTimeout(() => setScoreBurst(null), reducedMotion ? 450 : 1400);
    return () => window.clearTimeout(timer);
  }, [scoreBurst, reducedMotion]);

  const preview = useMemo(() => {
    if (!run || run.phase !== "playing" || selectedIds.length === 0) return null;
    try {
      const cards = selectedIds.map((id) => run.hand.find((card) => card.id === id)).filter(Boolean) as RunState["hand"];
      return calculateHandScore(
        run,
        cards,
        selectedUnoId ? { unoCardId: selectedUnoId, calledColor } : {},
      ).breakdown;
    } catch {
      return null;
    }
  }, [run, selectedIds, selectedUnoId, calledColor]);

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

  function changeSort(nextSort: CardSort) {
    setCardSort(nextSort);
    setLocalSetting("handSort", nextSort).catch(() => undefined);
  }

  function handleRecommend() {
    if (!run || run.phase !== "playing") return;
    try {
      const recommendation = recommendBestHand(
        run,
        selectedUnoId ? { unoCardId: selectedUnoId, calledColor } : {},
      );
      setSelectedIds([...recommendation.cardIds]);
      setNotice(`추천: ${recommendation.breakdown.handName} · ${recommendation.breakdown.total.toLocaleString()}점`);
      audio.playEffect("card-select");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "추천 패를 계산할 수 없습니다.");
    }
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
    setSelectedUnoId(null);
    setView("game");
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
    if (!run || selectedIds.length === 0) return;
    try {
      const result = playHand(run, selectedIds, selectedUnoId ? { unoCardId: selectedUnoId, calledColor } : {});
      setRun(result.state);
      setLastBreakdown(result.breakdown);
      setScoreBurst({ key: Date.now(), breakdown: result.breakdown });
      setSelectedIds([]);
      if (selectedUnoId) audio.playEffect("uno");
      audio.playEffect(result.state.phase === "lost" ? "lose" : result.roundCleared ? "win" : "score");
      setSelectedUnoId(null);
      setNotice(result.roundCleared ? `라운드 클리어 · ${result.breakdown.roundReward}코인 획득` : `${result.breakdown.handName} ${result.breakdown.total.toLocaleString()}점`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "핸드를 제출할 수 없습니다.");
    }
  }

  function handleDiscard() {
    if (!run || selectedIds.length === 0) return;
    const discardedCount = selectedIds.length;
    try {
      setRun(discardCards(run, selectedIds));
      setNotice(`${discardedCount}장 버림 · 이번 라운드에는 다시 나오지 않습니다.`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "카드를 버릴 수 없습니다.");
      return;
    }
    setSelectedIds([]);
    audio.playEffect("card-play");
  }

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || settingsOpen || utilityModal || pendingSellId || pendingStartMode || syncConflict) return;
      if (event.key === "?") {
        event.preventDefault();
        setUtilityModal("shortcuts");
        return;
      }
      if (view !== "game" || !run || run.phase !== "playing") return;
      const displayHand = sortHand(run.hand, cardSort);
      if (/^[1-8]$/.test(event.key)) {
        const card = displayHand[Number(event.key) - 1];
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
      } else if (key === "a") {
        event.preventDefault();
        document.getElementById("recommend-hand-button")?.click();
      } else if (key === "s") {
        event.preventDefault();
        const next = CARD_SORTS[(CARD_SORTS.indexOf(cardSort) + 1) % CARD_SORTS.length];
        changeSort(next);
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
  }, [cardSort, pendingSellId, pendingStartMode, run, selectedIds.length, settingsOpen, syncConflict, utilityModal, view]);

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
    { id: "community", label: "UNO 연구소", icon: "U" },
    { id: "leaderboard", label: "랭킹", icon: "#" },
    { id: "guestbook", label: "평가", icon: "★" },
  ];

  return (
    <div className={`app-shell${highContrast ? " high-contrast" : ""}${reducedMotion ? " reduced-motion" : ""}`}>
      <header className="topbar">
        <button type="button" className="brand" onClick={() => setView("lobby")} aria-label="COLOR BUST 홈">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><b>COLOR <span>BUST</span></b>
        </button>
        <nav className="topnav" aria-label="주 메뉴">
          {navItems.map((item) => <button type="button" key={item.id} className={`nav-button${view === item.id ? " active" : ""}`} onClick={() => item.id !== "game" || run ? setView(item.id) : requestStartRun("standard")}>{item.label}</button>)}
        </nav>
        <div className="top-actions">
          <span className={`online-pill${online ? "" : " offline"}`}><i />{online ? "ONLINE" : "OFFLINE"}</span>
          <button type="button" className="icon-button" aria-label={audio.musicEnabled ? "음악 끄기" : "음악 켜기"} onClick={audio.toggleMusic}>{audio.musicEnabled ? "♪" : "♩"}</button>
          <button type="button" className="icon-button" aria-label="키보드 단축키" onClick={() => setUtilityModal("shortcuts")}>?</button>
          <button type="button" className="icon-button profile-button" onClick={() => setSettingsOpen(true)}><i>{initialUser?.displayName.slice(0, 1) ?? "G"}</i><span>{initialUser?.displayName ?? "GUEST"}</span></button>
        </div>
      </header>

      {view === "lobby" && <Lobby savedRun={summary} equippedUno={equippedUno} signedIn={signedIn} onContinue={() => setView("game")} onStart={requestStartRun} onOpenCommunity={() => setView("community")} onOpenGuide={() => setUtilityModal("hands")} onOpenSettings={() => setSettingsOpen(true)} onOpenLeaderboard={() => setView("leaderboard")} onOpenGuestbook={() => setView("guestbook")} />}
      {view === "community" && <CommunityHub signedIn={signedIn} equippedId={equippedUno?.id} onEquip={(card) => { setEquippedUno(card); setLocalSetting("equippedCommunityUno", card).catch(() => undefined); setNotice(`${card.name} 카드를 다음 런의 첫 상점에 예약했습니다.`); }} />}
      {view === "leaderboard" && <LeaderboardView />}
      {view === "guestbook" && <GuestbookView signedIn={signedIn} />}
      {view === "game" && !run && <Lobby savedRun={null} equippedUno={equippedUno} signedIn={signedIn} onContinue={() => requestStartRun("standard")} onStart={requestStartRun} onOpenCommunity={() => setView("community")} onOpenGuide={() => setUtilityModal("hands")} onOpenSettings={() => setSettingsOpen(true)} onOpenLeaderboard={() => setView("leaderboard")} onOpenGuestbook={() => setView("guestbook")} />}
      {view === "game" && run?.phase === "playing" && (
        <GameTable
          run={run}
          selectedIds={selectedIds}
          selectedUnoId={selectedUnoId}
          calledColor={calledColor}
          preview={preview}
          lastBreakdown={lastBreakdown}
          scoreBurst={scoreBurst}
          notice={notice}
          cardSort={cardSort}
          onToggleCard={handleToggleCard}
          onSelectUno={setSelectedUnoId}
          onCallColor={setCalledColor}
          onSort={changeSort}
          onRecommend={handleRecommend}
          onClear={() => setSelectedIds([])}
          onOpenGuide={() => setUtilityModal("hands")}
          onOpenDeck={() => setUtilityModal("deck")}
          onOpenShortcuts={() => setUtilityModal("shortcuts")}
          onOpenLobby={() => setView("lobby")}
          onOpenSettings={() => setSettingsOpen(true)}
          onPlay={handlePlay}
          onDiscard={handleDiscard}
          onHotSwap={(color) => updateRun(() => setHotSwapColor(run, color))}
        />
      )}
      {view === "game" && run?.phase === "shop" && <ShopView run={run} notice={notice} onBuy={(offer) => { if (updateRun(() => buyShopOffer(run, offer.id))) audio.playEffect("buy"); }} onReroll={() => updateRun(() => rerollShop(run))} onSell={setPendingSellId} onNext={() => { updateRun(() => nextRound(run)); setLastBreakdown(null); setSelectedIds([]); }} onOpenLobby={() => setView("lobby")} onOpenSettings={() => setSettingsOpen(true)} />}
      {view === "game" && run && (run.phase === "won" || run.phase === "lost") && <ResultView run={run} notice={notice} signedIn={signedIn} onRank={submitRank} onRestart={() => startRun(run.mode)} onLobby={() => setView("lobby")} />}

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
      {pendingStartMode && run && <Modal title="새 런 시작" onClose={() => setPendingStartMode(null)}><div className="confirm-body"><p>진행 중인 <strong>{run.mode === "standard" ? "5 앤티" : "무한"} 런</strong> 대신 새 {pendingStartMode === "standard" ? "5 앤티" : "무한"} 런을 시작할까요?</p><div className="conflict-card"><span>현재 진행</span><b>ANTE {run.ante} · {ROUND_LABEL[run.round]}</b><small>{run.score.toLocaleString()} / {run.target.toLocaleString()}점</small></div><div className="confirm-actions"><button type="button" className="secondary-button" onClick={() => setPendingStartMode(null)}>현재 런 계속</button><button type="button" className="primary-button" onClick={() => { const mode = pendingStartMode; setPendingStartMode(null); startRun(mode); }}>새 런 시작</button></div></div></Modal>}
      {syncConflict && <Modal title="진행 상황 충돌" onClose={() => setSyncConflict(null)} wide><div className="confirm-body"><p>다른 기기에서 같은 모드의 런이 업데이트되었습니다. 자동으로 덮어쓰지 않고 선택을 기다립니다.</p><div className="conflict-grid"><div className="conflict-card"><span>이 기기</span><b>ANTE {syncConflict.local.ante} · {ROUND_LABEL[syncConflict.local.round]}</b><small>{syncConflict.local.stats.totalScore.toLocaleString()} 누적점</small></div><div className="conflict-card remote"><span>클라우드 · {new Date(syncConflict.remoteUpdatedAt).toLocaleString("ko-KR")}</span><b>ANTE {syncConflict.remote.ante} · {ROUND_LABEL[syncConflict.remote.round]}</b><small>{syncConflict.remote.stats.totalScore.toLocaleString()} 누적점</small></div></div><div className="confirm-actions"><button type="button" className="secondary-button" onClick={() => { const conflict = syncConflict; cloudRevision.current[conflict.remote.mode] = conflict.remoteRevision; setRun(conflict.remote); setSelectedIds([]); setLastBreakdown(null); setSyncConflict(null); setNotice("클라우드 진행을 불러왔습니다."); }}>클라우드 불러오기</button><button type="button" className="primary-button" onClick={() => { const conflict = syncConflict; cloudRevision.current[conflict.local.mode] = conflict.remoteRevision; setSyncConflict(null); syncCloudRun(conflict.local).then(() => setNotice("이 기기의 진행으로 클라우드를 갱신했습니다.")).catch((cause) => setNotice(cause instanceof Error ? cause.message : "동기화에 실패했습니다.")); }}>이 기기 진행 유지</button></div></div></Modal>}
    </div>
  );
}

function GameTable({
  run,
  selectedIds,
  selectedUnoId,
  calledColor,
  preview,
  lastBreakdown,
  scoreBurst,
  notice,
  cardSort,
  onToggleCard,
  onSelectUno,
  onCallColor,
  onSort,
  onRecommend,
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
  preview: ScoreBreakdown | null;
  lastBreakdown: ScoreBreakdown | null;
  scoreBurst: { key: number; breakdown: ScoreBreakdown } | null;
  notice: string;
  cardSort: CardSort;
  onToggleCard: (id: string) => void;
  onSelectUno: (id: string | null) => void;
  onCallColor: (color: CardColor) => void;
  onSort: (sort: CardSort) => void;
  onRecommend: () => void;
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
  const shown = preview ?? lastBreakdown;
  const hotSwap = run.jokers.find((joker) => joker.jokerId === "hot-swap");
  const displayHand = sortHand(run.hand, cardSort);
  const scoringIds = new Set(preview?.scoringCardIds ?? []);
  const lastDiscard = run.discardPile.at(-1);
  const nextSort = CARD_SORTS[(CARD_SORTS.indexOf(cardSort) + 1) % CARD_SORTS.length];
  return (
    <main className="game-view balatro-mobile-game">
      <div className="rotate-hint" role="note"><span aria-hidden="true">↻</span> 가로 화면에서 카드 테이블을 더 넓게 볼 수 있어요.</div>
      <div className="mobile-game-shell">
        <GameLeftRail run={run} breakdown={shown} onOpenHandGuide={onOpenGuide} onOpenDeckInspector={onOpenDeck} onOpenShortcutGuide={onOpenShortcuts} onOpenLobby={onOpenLobby} onOpenSettings={onOpenSettings}>
          {hotSwap && run.handHistory.length === 0 ? <ColorPicker value={hotSwap.selectedColor ?? "red"} onChange={onHotSwap} /> : null}
        </GameLeftRail>

        <section className="felt-table play-felt" aria-label="카드 플레이 테이블">
          <div className="felt-watermark" aria-hidden="true"><i /><i /><i /><i /></div>

          <section className="table-joker-zone" aria-labelledby="table-joker-title">
            <header><h2 id="table-joker-title">JOKERS</h2><span>{run.jokers.length}/{JOKER_SLOT_LIMIT}</span></header>
            <JokerRack run={run} />
          </section>

          <div className="table-center-status" role="status" aria-live="polite">
            <span>{notice || (selectedIds.length ? `${selectedIds.length}/5 SELECTED` : "카드를 선택하세요")}</span>
            <strong>{shown?.handName ?? "READY"}</strong>
            {preview && <b>+{preview.total.toLocaleString()}</b>}
          </div>

          <aside className="table-side-dock" aria-label="덱, 버린 카드, UNO">
            <button type="button" className="table-pile-button draw" onClick={onOpenDeck} aria-label={`뽑기 더미 ${run.drawPile.length}장, 덱 정보 열기`}>
              <span>DRAW</span><i>◇</i><strong>{run.drawPile.length}</strong>
            </button>
            <button type="button" className="table-pile-button discard" onClick={onOpenDeck} aria-label={`버린 카드 ${run.discardPile.length}장, 덱 정보 열기`}>
              <span>USED</span><i className={lastDiscard ? `card-${lastDiscard.color}` : ""}>{lastDiscard?.rank ?? "—"}</i><strong>{run.discardPile.length}</strong>
            </button>
            <section className={`table-uno-dock${run.unoUsedThisAnte ? " is-used" : ""}`} aria-label="커뮤니티 UNO">
              <header><span>UNO</span><b>{run.unoUsedThisAnte ? "USED" : "1/ANTE"}</b></header>
              {run.communityUno.length ? run.communityUno.map((card) => {
                const modules = [...card.positiveModules, ...card.negativeModules].map((id) => UNO_MODULE_CATALOG[id].name).join(" · ");
                return <button type="button" key={card.id} disabled={run.unoUsedThisAnte} title={`${card.name} · ${card.author} · ${modules}`} className={`table-uno-card${selectedUnoId === card.id ? " active" : ""}`} aria-pressed={selectedUnoId === card.id} onClick={() => onSelectUno(selectedUnoId === card.id ? null : card.id)}><b>U</b><small>{run.unoUsedThisAnte ? "USED" : card.name}</small></button>;
              }) : <div className="table-uno-empty">—</div>}
            </section>
          </aside>

          {selectedUnoId && <section className="table-uno-popover" aria-label="UNO 호출 색 선택"><div><b>COLOR CALL</b><small>득점 카드마다 +2 Chips</small></div><ColorPicker value={calledColor} onChange={onCallColor} /></section>}

          <section className="table-hand-stage" aria-label="손패와 행동">
            <div className="table-hand-tools">
              <button id="recommend-hand-button" type="button" onClick={onRecommend}><kbd>A</kbd><span>추천</span></button>
              <button type="button" onClick={() => onSort(nextSort)} title={`다음 정렬: ${CARD_SORT_LABEL[nextSort]}`}><kbd>S</kbd><span>{CARD_SORT_LABEL[cardSort]}</span></button>
              <button type="button" disabled={selectedIds.length === 0} onClick={onClear}><kbd>ESC</kbd><span>해제</span></button>
              <output>{selectedIds.length}/5</output>
            </div>
            <div className="hand-zone mobile-table-hand">{displayHand.map((card, index) => {
              const selected = selectedIds.includes(card.id);
              return <ColorCard key={card.id} card={{ ...card, value: card.rank }} selected={selected} selectionOrder={selected ? selectedIds.indexOf(card.id) + 1 : undefined} shortcut={index + 1} chipValue={rankChipValue(card.rank)} scoring={selected && preview ? scoringIds.has(card.id) : undefined} disabled={!selected && selectedIds.length >= 5} onClick={() => onToggleCard(card.id)} />;
            })}</div>
            <div className="table-action-dock">
              <button id="discard-button" type="button" className="table-action discard-action" disabled={!selectedIds.length || run.discardsLeft < 1} onClick={onDiscard}><kbd>D</kbd><span>버리기</span></button>
              <div className="table-action-state">{selectedUnoId ? <><b>UNO</b><span>{calledColor.toUpperCase()}</span></> : <><b>{shown?.handName ?? "HAND"}</b><span>{preview ? preview.total.toLocaleString() : "—"}</span></>}</div>
              <button id="play-hand-button" type="button" className="table-action play-action" disabled={!selectedIds.length || !preview} onClick={onPlay}><kbd>↵</kbd><span>핸드 제출</span></button>
            </div>
          </section>
        </section>
      </div>
      {scoreBurst && <div key={scoreBurst.key} className="score-burst" role="status" aria-live="assertive"><span>{scoreBurst.breakdown.handName}</span><strong>+{scoreBurst.breakdown.total.toLocaleString()}</strong><small>{scoreBurst.breakdown.chipsBeforeUno} CHIPS × {scoreBurst.breakdown.multiplierBeforeUno} MULT</small></div>}
    </main>
  );
}

function ColorPicker({ value, onChange }: { value: CardColor; onChange: (color: CardColor) => void }) {
  const labels: Record<CardColor, { name: string; short: string }> = {
    red: { name: "빨강", short: "R" },
    blue: { name: "파랑", short: "B" },
    green: { name: "초록", short: "G" },
    yellow: { name: "노랑", short: "Y" },
  };
  return <div className="color-call" role="group" aria-label="호출할 색">{CARD_COLORS.map((color) => <button type="button" key={color} className={`${color}${value === color ? " active" : ""}`} aria-label={`${labels[color].name} 선택`} aria-pressed={value === color} onClick={() => onChange(color)}><span>{labels[color].short}</span></button>)}</div>;
}

function JokerRack({ run, onSell }: { run: RunState; onSell?: (id: string) => void }) {
  return <div className="joker-rack"><div className="joker-rack-label"><b>JOKERS</b><small>{run.jokers.length} / 4</small></div>{run.jokers.map((joker) => { const definition = JOKER_CATALOG[joker.jokerId]; const refund = Math.max(1, Math.floor(definition.price / 2)); return <article className="joker-slot" key={joker.instanceId} title={definition.description}><span className="joker-slot-art">{definition.name.slice(0,1)}</span><div><b>{definition.name}</b><small>{definition.description}</small></div>{onSell && <button type="button" className="joker-sell" aria-label={`${definition.name} 판매`} onClick={() => onSell(joker.instanceId)}>판매 {refund}¢</button>}</article>; })}{Array.from({ length: Math.max(0, 4-run.jokers.length) }, (_, index) => <div className="joker-slot empty" key={`empty-${index}`}>+</div>)}</div>;
}

function ShopView({ run, notice, onBuy, onReroll, onSell, onNext, onOpenLobby, onOpenSettings }: { run: RunState; notice: string; onBuy: (offer: ShopOffer) => void; onReroll: () => void; onSell: (id: string) => void; onNext: () => void; onOpenLobby: () => void; onOpenSettings: () => void }) {
  const offerCount = run.shop?.offers.length ?? 0;
  const nextLabel = run.round === "boss" ? `ANTE ${run.ante + 1}` : ROUND_LABEL[ROUND_ORDER[ROUND_ORDER.indexOf(run.round) + 1]];
  return <main className="shop-view balatro-mobile-shop">
    <div className="rotate-hint" role="note"><span aria-hidden="true">↻</span> 가로 화면에서 상점 전체를 한눈에 볼 수 있어요.</div>
    <div className="mobile-shop-shell">
      <aside className="shop-mobile-rail" aria-label="상점 정보와 행동">
        <header className="shop-pixel-sign"><span>★</span><strong>SHOP</strong><small>BUILD YOUR RUN</small></header>
        <section className="shop-rail-score"><span>ROUND SCORE</span><b>{run.score.toLocaleString()}</b><small>ANTE {run.ante} · {ROUND_LABEL[run.round]}</small></section>
        <section className="shop-rail-wallet"><span>WALLET</span><strong>{run.coins}¢</strong></section>
        <dl className="shop-rail-slots"><div><dt>JOKERS</dt><dd>{run.jokers.length}/{JOKER_SLOT_LIMIT}</dd></div><div><dt>UNO</dt><dd>{run.communityUno.length}/{UNO_SLOT_LIMIT}</dd></div><div><dt>OFFERS</dt><dd>{offerCount}</dd></div></dl>
        <nav className="shop-rail-tools" aria-label="상점 메뉴"><button type="button" onClick={onOpenLobby}>⌂ <span>로비</span></button><button type="button" onClick={onOpenSettings}>⚙ <span>옵션</span></button></nav>
        <div className="shop-rail-actions"><button type="button" disabled={!run.shop || run.coins < run.shop.rerollCost} onClick={onReroll}>리롤 <b>{run.shop?.rerollCost ?? 0}¢</b></button><button type="button" onClick={onNext}>다음 <b>{nextLabel}</b></button></div>
      </aside>

      <section className="felt-table shop-felt" aria-label="컬러 마켓 진열대">
        <div className="felt-watermark" aria-hidden="true"><i /><i /><i /><i /></div>
        <section className="shop-owned-tray" aria-labelledby="shop-owned-title"><header><h2 id="shop-owned-title">OWNED JOKERS</h2><span>탭해서 판매</span></header><JokerRack run={run} onSell={onSell} /></section>
        <section className="shop-window" aria-labelledby="shop-window-title">
          <header><div><span>ROUND CLEAR</span><h1 id="shop-window-title">컬러 마켓</h1></div><p role="status" aria-live="polite">{notice || "다음 라운드를 위한 빌드를 완성하세요."}</p></header>
          <div className="shop-shelf">{run.shop?.offers.map((offer) => <ShopOfferCard key={offer.id} offer={offer} run={run} onBuy={() => onBuy(offer)} />)}</div>
          {offerCount === 0 && <div className="shop-empty"><b>SOLD OUT</b><span>리롤하거나 다음 라운드로 이동하세요.</span></div>}
        </section>
        <div className="shop-table-deck" aria-hidden="true"><div className="pile-card back"><i>◇</i></div><strong>{run.drawPile.length || 40}</strong></div>
      </section>
    </div>
  </main>;
}

function ShopOfferCard({ offer, run, onBuy }: { offer: ShopOffer; run: RunState; onBuy: () => void }) {
  let eyebrow = "JOKER"; let name = ""; let description = ""; let symbol = "?";
  let disabledReason = run.coins < offer.price ? `${offer.price - run.coins}¢ 부족` : "";
  if (offer.kind === "joker") { const definition = JOKER_CATALOG[offer.jokerId]; eyebrow = `${definition.rarity.toUpperCase()} JOKER`; name = definition.name; description = definition.description; symbol = name.slice(0,1); if (run.jokers.some((joker) => joker.jokerId === offer.jokerId)) disabledReason = "이미 보유 중"; else if (run.jokers.length >= JOKER_SLOT_LIMIT) disabledReason = "조커 슬롯 가득 참"; }
  if (offer.kind === "hand-upgrade") { const rule = HAND_RULES[offer.handType]; const level = run.handLevels[offer.handType]; eyebrow = "HAND PATCH"; name = `${rule.name} Lv.${level} → ${level + 1}`; description = `기본 Chips +${rule.chipsPerLevel}, Mult +${rule.multiplierPerLevel}`; symbol = "↑"; }
  if (offer.kind === "community-uno") { eyebrow = "COMMUNITY UNO"; name = offer.card.name; description = `${offer.card.author} 제작 · 앤티당 한 번 사용할 수 있습니다.`; symbol = "U"; }
  if (offer.kind === "community-uno") { if (run.communityUno.some((card) => card.id === offer.card.id)) disabledReason = "이미 보유 중"; else if (run.communityUno.length >= UNO_SLOT_LIMIT) disabledReason = "UNO 슬롯 가득 참"; }
  return <article className={`shop-card shop-${offer.kind}${disabledReason ? " unavailable" : ""}`}><div><span className="kicker">{eyebrow}</span><div className="shop-type-art">{symbol}</div><h3>{name}</h3><p>{description}</p>{offer.kind === "community-uno" && <ul className="shop-module-list">{[...offer.card.positiveModules, ...offer.card.negativeModules].map((id) => <li key={id} className={UNO_MODULE_CATALOG[id].kind}>{UNO_MODULE_CATALOG[id].points > 0 ? "+" : ""}{UNO_MODULE_CATALOG[id].points} · {UNO_MODULE_CATALOG[id].name}</li>)}</ul>}</div><footer><b>{offer.price} ¢</b><button type="button" className="small-action" disabled={Boolean(disabledReason)} onClick={onBuy}>{disabledReason || "구매"}</button></footer></article>;
}

function ResultView({ run, notice, signedIn, onRank, onRestart, onLobby }: { run: RunState; notice: string; signedIn: boolean; onRank: () => void; onRestart: () => void; onLobby: () => void }) {
  const won = run.phase === "won";
  return <main className="result-view"><section className="result-card"><div className="result-symbol">{won ? "✓" : "×"}</div><span className="kicker">{won ? "SIGNAL COMPLETE" : "CONNECTION LOST"}</span><h1>{won ? "BUSTED!" : "RUN OVER"}</h1><p>{won ? "5개의 앤티를 모두 돌파했습니다." : `ANTE ${run.ante} · ${ROUND_LABEL[run.round]}에서 신호가 끊겼습니다.`}</p><div className="result-stats"><div><span>TOTAL SCORE</span><b>{run.stats.totalScore.toLocaleString()}</b></div><div><span>BEST HAND</span><b>{run.stats.highestHandScore.toLocaleString()}</b></div><div><span>UNO USED</span><b>{run.stats.unoUses}</b></div></div>{notice && <div className="status-strip">{notice}</div>}<div className="result-actions"><button type="button" className="secondary-button" onClick={onLobby}>로비로</button><button type="button" className="secondary-button" onClick={onRestart}>같은 모드 재도전</button><button type="button" className="primary-button" disabled={!signedIn} onClick={onRank}>{signedIn ? "공식 기록 제출" : "로그인 후 기록 제출"}</button></div></section></main>;
}

function SettingsModal({ user, online, audio, highContrast, reducedMotion, onHighContrast, onReducedMotion, onClose }: { user: InitialUser | null; online: boolean; audio: ReturnType<typeof useGameAudio>; highContrast: boolean; reducedMotion: boolean; onHighContrast: (value: boolean) => void; onReducedMotion: (value: boolean) => void; onClose: () => void }) {
  return <Modal title="설정과 계정" onClose={onClose}><div className="settings-body"><section><span className="kicker">ACCOUNT</span><div className="account-card"><i>{user?.displayName.slice(0,1) ?? "G"}</i><div><b>{user?.displayName ?? "게스트 플레이어"}</b><small>{user?.email ?? "기기 안에만 진행 상황을 저장합니다."}</small></div><a href={user ? "/signout-with-chatgpt?return_to=%2F" : "/signin-with-chatgpt?return_to=%2F"}>{user ? "로그아웃" : "로그인"}</a></div><p className="settings-help">{user ? "클라우드 저장이 활성화되어 다른 기기에서 로그인해 이어할 수 있습니다." : "로그인하면 런, 제작 카드, 방명록과 랭킹 기록을 계정에 연결합니다."}</p></section><section><span className="kicker">ACCESSIBILITY</span><div className="setting-row"><span><b>고대비 모드</b><small>패널과 텍스트의 대비를 높입니다.</small></span><button type="button" role="switch" aria-checked={highContrast} aria-label="고대비 모드" className={`toggle${highContrast ? " on" : ""}`} onClick={() => onHighContrast(!highContrast)}><i /></button></div><div className="setting-row"><span><b>모션 줄이기</b><small>점수 팝업과 카드 이동 애니메이션을 줄입니다.</small></span><button type="button" role="switch" aria-checked={reducedMotion} aria-label="모션 줄이기" className={`toggle${reducedMotion ? " on" : ""}`} onClick={() => onReducedMotion(!reducedMotion)}><i /></button></div></section><section><span className="kicker">AUDIO</span><div className="setting-row"><span><b>배경 음악</b><small>런과 보스 장면별 배경음</small></span><button type="button" role="switch" aria-checked={audio.musicEnabled} aria-label="배경 음악" className={`toggle${audio.musicEnabled ? " on" : ""}`} onClick={audio.toggleMusic}><i /></button></div><label className="range-label" htmlFor="music-volume">배경 음악 볼륨</label><input id="music-volume" type="range" min="0" max="1" step="0.05" value={audio.musicVolume} onChange={(event) => audio.setMusicVolume(Number(event.target.value))} /><div className="setting-row"><span><b>효과음</b><small>카드, 점수, 상점 효과</small></span><button type="button" role="switch" aria-checked={audio.effectsEnabled} aria-label="효과음" className={`toggle${audio.effectsEnabled ? " on" : ""}`} onClick={audio.toggleEffects}><i /></button></div><label className="range-label" htmlFor="effects-volume">효과음 볼륨</label><input id="effects-volume" type="range" min="0" max="1" step="0.05" value={audio.effectsVolume} onChange={(event) => audio.setEffectsVolume(Number(event.target.value))} /></section><section><span className="kicker">SYNC</span><div className="setting-row"><span><b>{online ? "온라인 연결됨" : "오프라인 플레이 중"}</b><small>{online ? "대기 중인 작업을 자동으로 전송합니다." : "진행과 제작 카드를 기기에 안전하게 보관합니다."}</small></span><i className={online ? "sync-light on" : "sync-light"} /></div></section></div></Modal>;
}
