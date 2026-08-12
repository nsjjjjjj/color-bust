"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  { id: "color-burst", kind: "benefit", points: 1, label: "컬러 버스트", description: "득점 카드 중 호출한 색 카드가 2장 이상이면 +10 POWER" },
  { id: "steady-mult", kind: "benefit", points: 1, label: "스테디 멀트", description: "3장 이상 득점하면 +2 HYPE" },
  { id: "double-call", kind: "benefit", points: 2, label: "더블 콜", description: "라운드 시작 시 색을 2개 호출합니다. 두 색 모두 Color Call 효과를 받습니다" },
  { id: "precision-boost", kind: "benefit", points: 2, label: "프리시전 부스트", description: "정확히 5장이 득점하면 MAYHEM ×1.40" },
  { id: "signal-loss", kind: "drawback", points: -1, label: "신호 손실", description: "MAYHEM POWER -5" },
  { id: "off-color-tax", kind: "drawback", points: -1, label: "오픈 컬러 세금", description: "득점 카드에 호출하지 않은 색 1종마다 -2 POWER (최대 -6)" },
  { id: "glass-output", kind: "drawback", points: -2, label: "글래스 충격", description: "MAYHEM 최종 점수 ×0.85" },
  { id: "lockup-process", kind: "drawback", points: -2, label: "홀업 프로세스", description: "라운드 첫 핸드에서는 선택한 좋은 효과가 작동하지 않습니다" },
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
    description: "5장 전체 득점을 노리는 대신 첫 핸드의 효과를 포기하는 선택",
    moduleIds: ["precision-boost", "lockup-process"],
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
  const nameValid = name.trim().length >= 2 && name.trim().length <= 30;
  const countValid = selected.length >= 2 && selected.length <= 4;
  const hasBenefit = chosen.some((module) => module.kind === "benefit");
  const hasDrawback = chosen.some((module) => module.kind === "drawback");
  const balanced = total === 0;
  const valid = nameValid && countValid && balanced && hasBenefit && hasDrawback;
  const blockedReason = !nameValid
    ? "카드 이름을 2자 이상 입력하세요"
    : !hasBenefit || !hasDrawback
      ? "좋은 효과와 비용을 각 1개 이상 선택하세요"
      : !countValid
        ? "효과는 2~4개 선택하세요"
        : "합계를 0으로 맞추세요";

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

  const creatorDialog = (
    <Modal title="커뮤니티 메이헴 카드 제작기" className="creator-sheet" onClose={onClose} wide hideHeader>
      <header className="creator-header">
        <div className="creator-header-top">
          <span className="creator-kicker"><i aria-hidden="true">◇</i>CARD CREATOR</span>
          <button type="button" className="creator-close" aria-label="닫기" onClick={onClose}>×</button>
        </div>
        <div className="creator-heading">
          <span className="creator-heading-badge" aria-hidden="true">M</span>
          <h2>커뮤니티 메이헴 카드 제작기</h2>
        </div>
      </header>
      <div className="creator-layout">
        <div className="creator-form">
          <label>카드 이름 (필수, 2자 이상)<input value={name} maxLength={30} minLength={2} required onChange={(event) => setName(event.target.value)} placeholder="예: 컬러 과부하" /></label>
          <label>한 줄 소개 (선택)<textarea value={description} maxLength={120} onChange={(event) => setDescription(event.target.value)} placeholder="다른 플레이어가 사용법을 떠올릴 수 있게 설명하세요." /></label>
          <div className="module-columns">
            {(["benefit", "drawback"] as const).map((kind) => {
              const kindSelectedCount = chosen.filter((module) => module.kind === kind).length;
              return (
                <div key={kind}>
                  <h3 className={`module-column-title module-column-title-${kind}`}>
                    <i aria-hidden="true">{kind === "benefit" ? "✓" : "!"}</i>
                    {kind === "benefit" ? "좋은 효과" : "반드시 붙는 비용"}
                  </h3>
                  {modules.filter((module) => module.kind === kind).map((module) => {
                    const active = selected.includes(module.id);
                    const capped = !active && kindSelectedCount >= 2;
                    return (
                      <button
                        type="button"
                        key={module.id}
                        className={`module-option ${kind}${active ? " active" : ""}`}
                        disabled={capped}
                        title={capped ? `${kind === "benefit" ? "좋은 효과" : "비용"}는 최대 2개까지 선택할 수 있어요. 하나를 해제한 뒤 선택하세요.` : undefined}
                        onClick={() => setSelected((current) =>
                          active ? current.filter((id) => id !== module.id) : [...current, module.id],
                        )}
                      >
                        <b>{module.points > 0 ? `+${module.points}` : module.points}</b>
                        <span><strong>{module.label}</strong><small>{module.description.replace(/UNO/g, "메이헴")}</small></span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        <aside className="creator-preview">
          <h3 className="creator-preview-title">
            <i className="creator-preview-title-mark" aria-hidden="true">◆</i>
            <span className="creator-preview-title-rule" aria-hidden="true" />
            <span>카드 미리보기</span>
            <span className="creator-preview-title-rule" aria-hidden="true" />
            <i className="creator-preview-title-mark" aria-hidden="true">◆</i>
          </h3>
          <div className="mini-uno">
            <strong>{name || "이름 없는 카드"}</strong>
          </div>
          <div className={`budget-meter${total === 0 ? " balanced" : ""}`}>
            <span>밸런스 합계</span><b>{total > 0 ? `+${total}` : total}</b>
          </div>
          <p>기본 효과: 색 하나를 호출하고, 그 색의 득점 카드마다 +2칩 (최대 +10)</p>
          <ul>{chosen.map((module) => <li key={module.id}><b>{module.points > 0 ? `+${module.points}` : module.points}</b>{module.description.replace(/UNO/g, "메이헴")}</li>)}</ul>
          {error && <p className="form-error">{error}</p>}
          {!signedIn && <p className="form-note">로그인 전에는 기기에 보관하고 로그인 후 자동 업로드합니다.</p>}
          <button type="button" className="primary-button full" disabled={!valid || submitting} onClick={submit}>
            {submitting ? "검증 중…" : valid ? "밸런스 검사 후 등록" : blockedReason}
          </button>
        </aside>
      </div>
    </Modal>
  );

  // This dialog can be launched from the collection sheet. Render it beside
  // that sheet (still inside the app shell) so a transformed parent never
  // constrains the creator's viewport-sized frame or introduces a horizontal
  // scrollbar.
  const appShell = typeof document === "undefined" ? null : document.querySelector<HTMLElement>(".app-shell");
  return appShell ? createPortal(creatorDialog, appShell) : creatorDialog;
}
