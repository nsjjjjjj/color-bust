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
  JOKER_CATALOG,
  UNO_MODULE_CATALOG,
} from "../lib/game/constants";
import { calculateHandScore } from "../lib/game/scoring";
import { validateCommunityUnoCard } from "../lib/game/uno";
import type {
  CardColor,
  CommunityUnoCard as EngineUnoCard,
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
import { Lobby, type RunSummary } from "./components/lobby";
import { Modal } from "./components/modal";
import { GuestbookView, LeaderboardView } from "./components/social-views";
import { useGameAudio } from "./use-game-audio";

type View = "lobby" | "game" | "community" | "leaderboard" | "guestbook";
type InitialUser = Pick<UserProfile, "displayName" | "email"> & { userId?: string };

const ROUND_LABEL: Record<RunState["round"], string> = {
  small: "SMALL BLIND",
  big: "BIG BLIND",
  boss: "BOSS BLIND",
};

const ROUND_SHORT: Record<RunState["round"], string> = {
  small: "S",
  big: "B",
  boss: "!",
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
      const [localRuns, savedUno] = await Promise.all([
        listLocalRuns<RunState>().catch(() => []),
        getLocalSetting<CommunityUnoCard | undefined>("equippedCommunityUno", undefined).catch(() => undefined),
      ]);
      if (cancelled) return;
      setEquippedUno(savedUno);
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

    let response = await send(cloudRevision.current[state.mode]);
    if (response.status === 409) {
      const latest = await fetch(`/api/runs/${state.mode}`, { credentials: "include" }).then((value) => value.json()).catch(() => null) as { run?: CloudRun } | null;
      if (latest?.run) {
        cloudRevision.current[state.mode] = latest.run.revision;
        response = await send(latest.run.revision);
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

  function updateRun(action: () => RunState) {
    try {
      setRun(action());
      setNotice("");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "행동을 처리할 수 없습니다.");
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

  function handlePlay() {
    if (!run || selectedIds.length === 0) return;
    try {
      const result = playHand(run, selectedIds, selectedUnoId ? { unoCardId: selectedUnoId, calledColor } : {});
      setRun(result.state);
      setLastBreakdown(result.breakdown);
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
    updateRun(() => discardCards(run, selectedIds));
    setSelectedIds([]);
    audio.playEffect("card-play");
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
    <div className="app-shell">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => setView("lobby")} aria-label="COLOR BUST 홈">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><b>COLOR <span>BUST</span></b>
        </button>
        <nav className="topnav" aria-label="주 메뉴">
          {navItems.map((item) => <button type="button" key={item.id} className={`nav-button${view === item.id ? " active" : ""}`} onClick={() => item.id !== "game" || run ? setView(item.id) : startRun("standard")}>{item.label}</button>)}
        </nav>
        <div className="top-actions">
          <span className={`online-pill${online ? "" : " offline"}`}><i />{online ? "ONLINE" : "OFFLINE"}</span>
          <button type="button" className="icon-button" aria-label={audio.musicEnabled ? "음악 끄기" : "음악 켜기"} onClick={audio.toggleMusic}>{audio.musicEnabled ? "♪" : "♩"}</button>
          <button type="button" className="icon-button profile-button" onClick={() => setSettingsOpen(true)}><i>{initialUser?.displayName.slice(0, 1) ?? "G"}</i><span>{initialUser?.displayName ?? "GUEST"}</span></button>
        </div>
      </header>

      {view === "lobby" && <Lobby savedRun={summary} equippedUno={equippedUno} signedIn={signedIn} onContinue={() => setView("game")} onStart={startRun} onOpenCommunity={() => setView("community")} />}
      {view === "community" && <CommunityHub signedIn={signedIn} equippedId={equippedUno?.id} onEquip={(card) => { setEquippedUno(card); setLocalSetting("equippedCommunityUno", card).catch(() => undefined); setNotice(`${card.name} 카드를 다음 런의 첫 상점에 예약했습니다.`); }} />}
      {view === "leaderboard" && <LeaderboardView />}
      {view === "guestbook" && <GuestbookView signedIn={signedIn} />}
      {view === "game" && !run && <Lobby savedRun={null} equippedUno={equippedUno} signedIn={signedIn} onContinue={() => startRun("standard")} onStart={startRun} onOpenCommunity={() => setView("community")} />}
      {view === "game" && run?.phase === "playing" && <GameTable run={run} selectedIds={selectedIds} selectedUnoId={selectedUnoId} calledColor={calledColor} preview={preview} lastBreakdown={lastBreakdown} notice={notice} onToggleCard={(id) => { setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < 5 ? [...current, id] : current); audio.playEffect("card-select"); }} onSelectUno={setSelectedUnoId} onCallColor={setCalledColor} onPlay={handlePlay} onDiscard={handleDiscard} onHotSwap={(color) => updateRun(() => setHotSwapColor(run, color))} />}
      {view === "game" && run?.phase === "shop" && <ShopView run={run} notice={notice} onBuy={(offer) => { updateRun(() => buyShopOffer(run, offer.id)); audio.playEffect("buy"); }} onReroll={() => updateRun(() => rerollShop(run))} onSell={(id) => updateRun(() => sellJoker(run, id))} onNext={() => { updateRun(() => nextRound(run)); setLastBreakdown(null); setSelectedIds([]); }} />}
      {view === "game" && run && (run.phase === "won" || run.phase === "lost") && <ResultView run={run} notice={notice} signedIn={signedIn} onRank={submitRank} onRestart={() => startRun(run.mode)} onLobby={() => setView("lobby")} />}

      <nav className="mobile-nav" aria-label="모바일 메뉴">{navItems.map((item) => <button type="button" key={item.id} className={view === item.id ? "active" : ""} onClick={() => item.id !== "game" || run ? setView(item.id) : startRun("standard")}><b>{item.icon}</b>{item.label}</button>)}</nav>
      {notice && view !== "game" && <div className="global-notice" role="status">{notice}</div>}
      {loadingSave && <div className="loading-save" role="status">저장된 런 확인 중…</div>}
      {settingsOpen && <SettingsModal user={initialUser} online={online} audio={audio} onClose={() => setSettingsOpen(false)} />}
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
  notice,
  onToggleCard,
  onSelectUno,
  onCallColor,
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
  notice: string;
  onToggleCard: (id: string) => void;
  onSelectUno: (id: string | null) => void;
  onCallColor: (color: CardColor) => void;
  onPlay: () => void;
  onDiscard: () => void;
  onHotSwap: (color: CardColor) => void;
}) {
  const shown = preview ?? lastBreakdown;
  const hotSwap = run.jokers.find((joker) => joker.jokerId === "hot-swap");
  return (
    <main className="game-view">
      <div className="run-hud">
        <div className="hud-cell"><span>ANTE</span><strong>{run.ante}{run.mode === "endless" ? " ∞" : " / 5"}</strong></div>
        <div className="hud-cell hud-score"><header><span>ROUND SCORE</span><div><b>{run.score.toLocaleString()}</b><small> / {run.target.toLocaleString()}</small></div></header><div className="score-track"><i style={{ width: `${Math.min(100, run.score / run.target * 100)}%` }} /></div></div>
        <div className="hud-cell"><span>ROUND</span><strong>{ROUND_LABEL[run.round]}</strong></div>
        <div className="hud-cell hud-resource"><i>♠</i><div><span>HANDS</span><b>{run.handsLeft}</b></div></div>
        <div className="hud-cell hud-resource"><i>↻</i><div><span>DISCARDS</span><b>{run.discardsLeft}</b></div></div>
      </div>
      <JokerRack run={run} />
      <div className="game-table">
        <aside className="round-panel">
          <div className="round-chip">{ROUND_SHORT[run.round]}</div>
          <h2>{ROUND_LABEL[run.round]}</h2>
          <p>{run.round === "boss" ? "점수 요구량이 높은 마지막 관문입니다." : "4번의 핸드 안에 목표 점수를 넘기세요."}</p>
          {run.round === "boss" && <div className="boss-rule">BOSS · 이 라운드는 기본 라운드보다 약 25% 높은 목표를 요구합니다.</div>}
          {hotSwap && run.handHistory.length === 0 && <div className="hot-swap-picker"><span>HOT SWAP</span><ColorPicker value={hotSwap.selectedColor ?? "red"} onChange={onHotSwap} /></div>}
        </aside>
        <section className="play-zone">
          <div className="played-summary"><span>{notice || "SELECT UP TO 5 CARDS"}</span><strong>{shown ? <><em>{shown.handName}</em> · {shown.total.toLocaleString()}</> : "족보를 만들어 보세요"}</strong></div>
          <div className="hand-zone">{run.hand.map((card) => <ColorCard key={card.id} card={{ ...card, value: card.rank }} selected={selectedIds.includes(card.id)} onClick={() => onToggleCard(card.id)} />)}</div>
          <div className="game-controls"><span className="selection-count">SELECTED {selectedIds.length} / 5</span><button type="button" className="secondary-button" disabled={!selectedIds.length || run.discardsLeft < 1} onClick={onDiscard}>선택 버리기 · {run.discardsLeft}</button><button type="button" className="primary-button" disabled={!selectedIds.length} onClick={onPlay}>핸드 제출</button></div>
        </section>
        <aside className="score-panel">
          <span className="kicker">SCORE PREVIEW</span>
          <div className="score-equation"><div className="score-box"><span>CHIPS</span><b>{shown?.chipsBeforeUno ?? 0}</b></div><b>×</b><div className="score-box mult"><span>MULT</span><b>{shown?.multiplierBeforeUno ?? 0}</b></div></div>
          <div className="estimated-score"><span>{preview ? "예상 점수" : "직전 핸드"}</span><b>{(shown?.total ?? 0).toLocaleString()}</b></div>
          {shown && <div className="breakdown-list"><div><span>{shown.handName} Lv.{shown.handLevel}</span><b>+{shown.baseChips} Chips</b></div><div><span>숫자 카드</span><b>+{shown.numericChips}</b></div>{shown.appliedJokers.map((effect, index) => <div key={`${effect.sourceId}-${index}`}><span>{effect.sourceName}</span><b>{effect.description}</b></div>)}{shown.uno && <div><span>{shown.uno.cardName}</span><b>×{shown.uno.capMultiplier.toFixed(2)} cap</b></div>}</div>}
          <div className="uno-deck">
            {run.communityUno.map((card) => <button type="button" key={card.id} disabled={run.unoUsedThisAnte} className={`uno-trigger${selectedUnoId === card.id ? " active" : ""}`} onClick={() => onSelectUno(selectedUnoId === card.id ? null : card.id)}><b>UNO</b><span><strong>{card.name}</strong><small>{run.unoUsedThisAnte ? "이번 앤티 사용 완료" : `${card.author} · 이번 핸드에 사용`}</small></span></button>)}
          </div>
          {selectedUnoId && <ColorPicker value={calledColor} onChange={onCallColor} />}
        </aside>
      </div>
    </main>
  );
}

function ColorPicker({ value, onChange }: { value: CardColor; onChange: (color: CardColor) => void }) {
  return <div className="color-call" aria-label="호출할 색">{CARD_COLORS.map((color) => <button type="button" key={color} className={`${color}${value === color ? " active" : ""}`} aria-label={`${color} 선택`} onClick={() => onChange(color)} />)}</div>;
}

function JokerRack({ run, onSell }: { run: RunState; onSell?: (id: string) => void }) {
  return <div className="joker-rack"><div className="joker-rack-label"><b>JOKERS</b><small>{run.jokers.length} / 4</small></div>{run.jokers.map((joker) => { const definition = JOKER_CATALOG[joker.jokerId]; return <button type="button" className="joker-slot" key={joker.instanceId} title={definition.description} onClick={() => onSell?.(joker.instanceId)}><span className="joker-slot-art">{definition.name.slice(0,1)}</span><div><b>{definition.name}</b><small>{definition.description}{onSell ? " · 눌러서 판매" : ""}</small></div></button>; })}{Array.from({ length: Math.max(0, 4-run.jokers.length) }, (_, index) => <div className="joker-slot empty" key={`empty-${index}`}>+</div>)}</div>;
}

function ShopView({ run, notice, onBuy, onReroll, onSell, onNext }: { run: RunState; notice: string; onBuy: (offer: ShopOffer) => void; onReroll: () => void; onSell: (id: string) => void; onNext: () => void }) {
  return <main className="shop-view"><div className="shop-header"><div><span className="kicker">ROUND CLEAR · SUPPLY DROP</span><h1>컬러 마켓</h1><p>{notice || "다음 라운드를 위한 빌드를 완성하세요."}</p></div><div className="coin-display">{run.coins} ¢</div></div><JokerRack run={run} onSell={onSell} /><div className="shop-shelf">{run.shop?.offers.map((offer) => <ShopOfferCard key={offer.id} offer={offer} coins={run.coins} onBuy={() => onBuy(offer)} />)}</div><div className="shop-actions"><p>남은 코인은 다음 상점으로 이어집니다. 조커를 누르면 절반 가격에 판매합니다.</p><div><button type="button" className="secondary-button" disabled={!run.shop || run.coins < run.shop.rerollCost} onClick={onReroll}>리롤 · {run.shop?.rerollCost ?? 0}¢</button><button type="button" className="primary-button" onClick={onNext}>다음 라운드 →</button></div></div></main>;
}

function ShopOfferCard({ offer, coins, onBuy }: { offer: ShopOffer; coins: number; onBuy: () => void }) {
  let eyebrow = "JOKER"; let name = ""; let description = ""; let symbol = "?";
  if (offer.kind === "joker") { const definition = JOKER_CATALOG[offer.jokerId]; eyebrow = `${definition.rarity.toUpperCase()} JOKER`; name = definition.name; description = definition.description; symbol = name.slice(0,1); }
  if (offer.kind === "hand-upgrade") { const rule = HAND_RULES[offer.handType]; eyebrow = "HAND PATCH"; name = `${rule.name} 레벨 업`; description = `기본 Chips +${rule.chipsPerLevel}, Mult +${rule.multiplierPerLevel}`; symbol = "↑"; }
  if (offer.kind === "community-uno") { eyebrow = "COMMUNITY UNO"; name = offer.card.name; description = `${offer.card.author} 제작 · 앤티당 한 번 사용할 수 있습니다.`; symbol = "U"; }
  return <article className="shop-card"><div><span className="kicker">{eyebrow}</span><div className="shop-type-art">{symbol}</div><h3>{name}</h3><p>{description}</p></div><footer><b>{offer.price} ¢</b><button type="button" className="small-action" disabled={coins < offer.price} onClick={onBuy}>구매</button></footer></article>;
}

function ResultView({ run, notice, signedIn, onRank, onRestart, onLobby }: { run: RunState; notice: string; signedIn: boolean; onRank: () => void; onRestart: () => void; onLobby: () => void }) {
  const won = run.phase === "won";
  return <main className="result-view"><section className="result-card"><div className="result-symbol">{won ? "✓" : "×"}</div><span className="kicker">{won ? "SIGNAL COMPLETE" : "CONNECTION LOST"}</span><h1>{won ? "BUSTED!" : "RUN OVER"}</h1><p>{won ? "5개의 앤티를 모두 돌파했습니다." : `ANTE ${run.ante} · ${ROUND_LABEL[run.round]}에서 신호가 끊겼습니다.`}</p><div className="result-stats"><div><span>TOTAL SCORE</span><b>{run.stats.totalScore.toLocaleString()}</b></div><div><span>BEST HAND</span><b>{run.stats.highestHandScore.toLocaleString()}</b></div><div><span>UNO USED</span><b>{run.stats.unoUses}</b></div></div>{notice && <div className="status-strip">{notice}</div>}<div className="result-actions"><button type="button" className="secondary-button" onClick={onLobby}>로비로</button><button type="button" className="secondary-button" onClick={onRestart}>같은 모드 재도전</button><button type="button" className="primary-button" disabled={!signedIn} onClick={onRank}>{signedIn ? "공식 기록 제출" : "로그인 후 기록 제출"}</button></div></section></main>;
}

function SettingsModal({ user, online, audio, onClose }: { user: InitialUser | null; online: boolean; audio: ReturnType<typeof useGameAudio>; onClose: () => void }) {
  return <Modal title="설정과 계정" onClose={onClose}><div className="settings-body"><section><span className="kicker">ACCOUNT</span><div className="account-card"><i>{user?.displayName.slice(0,1) ?? "G"}</i><div><b>{user?.displayName ?? "게스트 플레이어"}</b><small>{user?.email ?? "기기 안에만 진행 상황을 저장합니다."}</small></div><a href={user ? "/signout-with-chatgpt?return_to=%2F" : "/signin-with-chatgpt?return_to=%2F"}>{user ? "로그아웃" : "로그인"}</a></div><p className="settings-help">{user ? "클라우드 저장이 활성화되어 다른 기기에서 로그인해 이어할 수 있습니다." : "로그인하면 런, 제작 카드, 방명록과 랭킹 기록을 계정에 연결합니다."}</p></section><section><span className="kicker">AUDIO</span><div className="setting-row"><span><b>배경 음악</b><small>public/audio/bgm-*.mp3</small></span><button type="button" className={`toggle${audio.musicEnabled ? " on" : ""}`} onClick={audio.toggleMusic}><i /></button></div><input type="range" min="0" max="1" step="0.05" value={audio.musicVolume} onChange={(event) => audio.setMusicVolume(Number(event.target.value))} /><div className="setting-row"><span><b>효과음</b><small>카드, 점수, 상점 효과</small></span><button type="button" className={`toggle${audio.effectsEnabled ? " on" : ""}`} onClick={audio.toggleEffects}><i /></button></div><input type="range" min="0" max="1" step="0.05" value={audio.effectsVolume} onChange={(event) => audio.setEffectsVolume(Number(event.target.value))} /></section><section><span className="kicker">SYNC</span><div className="setting-row"><span><b>{online ? "온라인 연결됨" : "오프라인 플레이 중"}</b><small>{online ? "대기 중인 작업을 자동으로 전송합니다." : "진행과 제작 카드를 기기에 안전하게 보관합니다."}</small></span><i className={online ? "sync-light on" : "sync-light"} /></div></section></div></Modal>;
}
