"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CommunityUnoCard,
  ListCommunityCardsResponse,
  UnoModuleDefinition,
} from "../../lib/server/contracts";
import {
  cacheCommunityCards,
  enqueueSync,
  loadCachedCommunityCards,
} from "../../lib/offline";
import { Modal } from "./modal";
import { UnoCard } from "./uno-card";

const FALLBACK_MODULES: UnoModuleDefinition[] = [
  { id: "color-burst", kind: "benefit", points: 1, label: "컬러 버스트", description: "호출 색이 2장 이상이면 +8칩" },
  { id: "steady-mult", kind: "benefit", points: 1, label: "스테디 멀트", description: "+1배수" },
  { id: "double-call", kind: "benefit", points: 2, label: "더블 콜", description: "Color Call 추가 발동" },
  { id: "precision-boost", kind: "benefit", points: 2, label: "프리시전 부스트", description: "5장 모두 득점하면 ×1.25" },
  { id: "signal-loss", kind: "drawback", points: -1, label: "신호 손실", description: "메이헴 칩 -6" },
  { id: "off-color-tax", kind: "drawback", points: -1, label: "오프 컬러 세금", description: "호출하지 않은 색마다 -2칩" },
  { id: "glass-output", kind: "drawback", points: -2, label: "글래스 출력", description: "메이헴 적용 결과 ×0.75" },
  { id: "hard-cap", kind: "drawback", points: -2, label: "하드 캡", description: "메이헴 상승 상한 ×1.30" },
];

const FALLBACK_CARDS: CommunityUnoCard[] = [
  {
    id: "sample-color-overload",
    creatorUserId: "system",
    creatorName: "JUNGLE_00",
    name: "컬러 과부하",
    description: "호출한 색에 출력을 몰아 넣는 안정형 카드",
    moduleIds: ["double-call", "glass-output"],
    pointTotal: 0,
    version: 1,
    likeCount: 42,
    ratingAverage: 4.6,
    ratingCount: 18,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "sample-deep-scan",
    creatorUserId: "system",
    creatorName: "BUG_HUNTER",
    name: "정밀 스캔",
    description: "5장 전체 득점을 노리는 대신 상승 상한을 낮추는 선택",
    moduleIds: ["precision-boost", "hard-cap"],
    pointTotal: 0,
    version: 1,
    likeCount: 31,
    ratingAverage: 4.3,
    ratingCount: 11,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
];

function moduleSummary(card: CommunityUnoCard, modules: UnoModuleDefinition[]) {
  const definitions = card.moduleIds.map((id) => modules.find((module) => module.id === id)).filter(Boolean);
  return {
    positiveLabel: definitions.find((module) => module?.kind === "benefit")?.description.replace(/UNO/g, "메이헴"),
    negativeLabel: definitions.find((module) => module?.kind === "drawback")?.description.replace(/UNO/g, "메이헴"),
  };
}

export function CommunityHub({
  signedIn,
  equippedId,
  onEquip,
}: {
  signedIn: boolean;
  equippedId?: string;
  onEquip: (card: CommunityUnoCard) => void;
}) {
  const [cards, setCards] = useState<CommunityUnoCard[]>(FALLBACK_CARDS);
  const [modules, setModules] = useState<UnoModuleDefinition[]>(FALLBACK_MODULES);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [notice, setNotice] = useState("커뮤니티 카드를 불러오는 중입니다.");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/community", { credentials: "include" });
        if (!response.ok) throw new Error("network");
        const data = (await response.json()) as ListCommunityCardsResponse;
        if (cancelled) return;
        setCards(data.cards.length ? data.cards : FALLBACK_CARDS);
        setModules(data.moduleCatalog.length ? data.moduleCatalog : FALLBACK_MODULES);
        setNotice("온라인 커뮤니티와 동기화되었습니다.");
        await cacheCommunityCards(data.cards);
      } catch {
        const cached = await loadCachedCommunityCards<CommunityUnoCard>().catch(() => []);
        if (!cancelled && cached.length) setCards(cached);
        if (!cancelled) setNotice("오프라인 카드 보관함을 사용 중입니다.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="content-view community-view">
      <div className="view-heading">
        <div>
          <span className="kicker">커뮤니티 덱</span>
          <h1>다른 정글러의 한 수</h1>
          <p>효과와 비용의 합이 0인 메이헴 카드를 만들고, 누군가의 다음 스테이지에 등장시키세요.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => setCreatorOpen(true)}>
          + 메이헴 카드 제작
        </button>
      </div>
      <div className="status-strip"><span className="live-dot" />{notice}</div>
      <div className="uno-grid">
        {cards.map((card) => {
          const summary = moduleSummary(card, modules);
          return (
            <UnoCard
              key={card.id}
              card={{
                ...card,
                likes: card.likeCount,
                rating: card.ratingAverage ?? 0,
                ...summary,
              }}
              selected={equippedId === card.id}
              onSelect={() => onEquip(card)}
              actionLabel="다음 런에 장착"
            />
          );
        })}
      </div>
      {creatorOpen && (
        <UnoCreator
          modules={modules}
          signedIn={signedIn}
          onClose={() => setCreatorOpen(false)}
          onCreated={(card) => {
            setCards((current) => [card, ...current]);
            setCreatorOpen(false);
          }}
        />
      )}
    </section>
  );
}

function UnoCreator({
  modules,
  signedIn,
  onClose,
  onCreated,
}: {
  modules: UnoModuleDefinition[];
  signedIn: boolean;
  onClose: () => void;
  onCreated: (card: CommunityUnoCard) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const chosen = useMemo(
    () => selected.map((id) => modules.find((module) => module.id === id)).filter(Boolean) as UnoModuleDefinition[],
    [modules, selected],
  );
  const total = chosen.reduce((sum, module) => sum + module.points, 0);
  const valid =
    name.trim().length >= 2 &&
    name.trim().length <= 30 &&
    selected.length >= 2 &&
    selected.length <= 4 &&
    total === 0 &&
    chosen.some((module) => module.kind === "benefit") &&
    chosen.some((module) => module.kind === "drawback");

  async function submit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError("");
    const body = { name: name.trim(), description: description.trim(), moduleIds: selected };
    try {
      if (!navigator.onLine || !signedIn) {
        await enqueueSync({ url: "/api/community", method: "POST", body });
        const now = new Date().toISOString();
        onCreated({
          id: `pending-${crypto.randomUUID()}`,
          creatorUserId: "pending",
          creatorName: signedIn ? "동기화 대기" : "로그인 후 업로드",
          ...body,
          pointTotal: 0,
          version: 1,
          likeCount: 0,
          ratingAverage: null,
          ratingCount: 0,
          createdAt: now,
          updatedAt: now,
        });
        return;
      }
      const response = await fetch("/api/community", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message ?? "카드를 등록하지 못했습니다.");
      onCreated(data.card as CommunityUnoCard);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "카드를 등록하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="커뮤니티 메이헴 카드 제작기" onClose={onClose} wide>
      <div className="creator-layout">
        <div className="creator-form">
          <label>카드 이름<input value={name} maxLength={30} onChange={(event) => setName(event.target.value)} placeholder="예: 컬러 과부하" /></label>
          <label>한 줄 소개<textarea value={description} maxLength={120} onChange={(event) => setDescription(event.target.value)} placeholder="다른 플레이어가 사용법을 떠올릴 수 있게 설명하세요." /></label>
          <div className="module-columns">
            {(["benefit", "drawback"] as const).map((kind) => (
              <div key={kind}>
                <h3>{kind === "benefit" ? "좋은 효과" : "반드시 붙는 비용"}</h3>
                {modules.filter((module) => module.kind === kind).map((module) => {
                  const active = selected.includes(module.id);
                  return (
                    <button
                      type="button"
                      key={module.id}
                      className={`module-option ${kind}${active ? " active" : ""}`}
                      onClick={() => setSelected((current) =>
                        active ? current.filter((id) => id !== module.id) : current.length < 4 ? [...current, module.id] : current,
                      )}
                    >
                      <b>{module.points > 0 ? `+${module.points}` : module.points}</b>
                      <span><strong>{module.label}</strong><small>{module.description.replace(/UNO/g, "메이헴")}</small></span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <aside className="creator-preview">
          <div className="mini-uno"><span>M</span><strong>{name || "이름 없는 카드"}</strong></div>
          <div className={`budget-meter${total === 0 ? " balanced" : ""}`}>
            <span>밸런스 합계</span><b>{total > 0 ? `+${total}` : total}</b>
          </div>
          <p>기본 효과: 색 하나를 호출하고, 그 색의 득점 카드마다 +2칩 (최대 +10)</p>
          <ul>{chosen.map((module) => <li key={module.id}><b>{module.points > 0 ? `+${module.points}` : module.points}</b>{module.description.replace(/UNO/g, "메이헴")}</li>)}</ul>
          {error && <p className="form-error">{error}</p>}
          {!signedIn && <p className="form-note">로그인 전에는 기기에 보관하고 로그인 후 자동 업로드합니다.</p>}
          <button type="button" className="primary-button full" disabled={!valid || submitting} onClick={submit}>
            {submitting ? "검증 중…" : valid ? "밸런스 검사 후 등록" : "합계를 0으로 맞추세요"}
          </button>
        </aside>
      </div>
    </Modal>
  );
}
