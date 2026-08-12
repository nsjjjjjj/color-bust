"use client";

import { useEffect, useState } from "react";
import type {
  GuestbookEntry,
  LeaderboardEntry,
  ListGuestbookResponse,
  ListLeaderboardResponse,
} from "../../lib/server/contracts";
import { enqueueSync } from "../../lib/offline";

const SAMPLE_RANKS: LeaderboardEntry[] = [
  { rank: 1, userId: "sample-1", displayName: "JUNGLE_17", mode: "endless", score: 248320, ante: 14, runRevision: 0, rulesetVersion: 1, updatedAt: new Date(0).toISOString() },
  { rank: 2, userId: "sample-2", displayName: "NULL_POINTER", mode: "endless", score: 196410, ante: 12, runRevision: 0, rulesetVersion: 1, updatedAt: new Date(0).toISOString() },
  { rank: 3, userId: "sample-3", displayName: "RED_STACK", mode: "endless", score: 151770, ante: 11, runRevision: 0, rulesetVersion: 1, updatedAt: new Date(0).toISOString() },
];

const SAMPLE_GUESTBOOK: GuestbookEntry[] = [
  { id: "sample-g1", authorUserId: "sample", authorName: "정글러 3기", message: "0 두 장을 모아서 널 포인터를 터뜨리는 순간이 제일 재밌었어요.", rating: 5, createdAt: new Date().toISOString() },
  { id: "sample-g2", authorUserId: "sample", authorName: "BUG_HUNTER", message: "친구가 만든 메이헴 카드가 보스 마지막 손에 나와서 살았습니다. 카드 설명이 더 크게 보이면 좋겠어요!", rating: 4, createdAt: new Date().toISOString() },
];

const RATING_LABELS = ["", "별로예요", "아쉬워요", "괜찮아요", "좋아요", "최고예요"] as const;

export function LeaderboardView() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>(SAMPLE_RANKS);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/leaderboard?mode=endless", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("network");
        return (await response.json()) as ListLeaderboardResponse;
      })
      .then((data) => {
        if (!cancelled) {
          setEntries(data.entries.length ? data.entries : SAMPLE_RANKS);
          setOffline(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEntries(SAMPLE_RANKS);
          setOffline(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="content-view leaderboard-view">
      <div className="view-heading">
        <div><span className="kicker">전체 기록</span><h1>랭킹</h1></div>
      </div>
      {offline && <div className="status-strip">오프라인 예시 기록을 표시하고 있습니다.</div>}
      <div className="leaderboard-table" role="table" aria-label="랭킹">
        <div className="leaderboard-row table-head" role="row"><span>순위</span><span>플레이어</span><span>도달</span><span>점수</span></div>
        {entries.map((entry, index) => (
          <div className={`leaderboard-row rank-${index + 1}`} role="row" key={`${entry.userId}-${entry.mode}`}>
            <span className="rank-number">{String(entry.rank ?? index + 1).padStart(2, "0")}</span>
            <span><i className="player-avatar">{entry.displayName.slice(0, 1)}</i><b>{entry.displayName}</b></span>
            <span>STAGE {entry.ante}</span>
            <strong>{entry.score.toLocaleString()}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export function GuestbookView({ signedIn }: { signedIn: boolean }) {
  const [entries, setEntries] = useState<GuestbookEntry[]>(SAMPLE_GUESTBOOK);
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(0);
  const [previewRating, setPreviewRating] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/guestbook", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("network");
        return (await response.json()) as ListGuestbookResponse;
      })
      .then((data) => data.entries.length && setEntries(data.entries))
      .catch(() => setNotice("오프라인입니다. 작성한 평가는 연결 후 전송됩니다."));
  }, []);

  async function submit() {
    const trimmed = message.trim();
    if (trimmed.length < 2 || rating < 1) return;
    const body = { message: trimmed, rating };
    try {
      if (!navigator.onLine || !signedIn) {
        await enqueueSync({ url: "/api/guestbook", method: "POST", body });
        setEntries((current) => [{ id: `pending-${crypto.randomUUID()}`, authorUserId: "pending", authorName: signedIn ? "전송 대기" : "로그인 후 전송", message: trimmed, rating, createdAt: new Date().toISOString() }, ...current]);
        setNotice("평가를 기기에 저장했습니다. 로그인하고 연결되면 자동 전송합니다.");
      } else {
        const response = await fetch("/api/guestbook", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error?.message ?? "등록 실패");
        setEntries((current) => [data.entry as GuestbookEntry, ...current]);
        setNotice("평가가 등록되었습니다. 고마워요!");
      }
      setMessage("");
      setRating(0);
      setPreviewRating(0);
    } catch {
      await enqueueSync({ url: "/api/guestbook", method: "POST", body });
      setNotice("전송하지 못해 기기에 안전하게 보관했습니다.");
    }
  }

  const average = entries.length ? entries.reduce((sum, entry) => sum + entry.rating, 0) / entries.length : 0;
  const visibleRating = previewRating || rating;
  return (
    <section className="content-view guestbook-view">
      <div className="view-heading"><div><span className="kicker">런 평가</span><h1>플레이 평가소</h1><p>한 판을 마친 정글러의 평가와 다음 패치를 위한 피드백입니다.</p></div><div className="rating-summary"><strong>{average.toFixed(1)}</strong><span>★★★★★</span><small>{entries.length}개의 평가</small></div></div>
      <div className="guestbook-layout">
        <form className="guestbook-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <span className="kicker">평가 남기기</span><h2>어땠나요?</h2>
          <div
            className="star-rating-control"
            onPointerLeave={() => setPreviewRating(0)}
          >
            <div className="star-input" role="radiogroup" aria-label="플레이 별점">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  type="button"
                  role="radio"
                  key={value}
                  aria-checked={rating === value}
                  aria-label={`별 ${value}개, ${RATING_LABELS[value]}`}
                  className={value <= visibleRating ? "active" : ""}
                  onPointerEnter={() => setPreviewRating(value)}
                  onFocus={() => setPreviewRating(value)}
                  onBlur={() => setPreviewRating(0)}
                  onClick={() => setRating(value)}
                >
                  <span aria-hidden="true">{value <= visibleRating ? "★" : "☆"}</span>
                </button>
              ))}
            </div>
            <p className={`rating-choice${rating ? " selected" : ""}`} aria-live="polite">
              {visibleRating ? `${visibleRating}점 · ${RATING_LABELS[visibleRating]}` : "별을 눌러 평가해 주세요"}
            </p>
          </div>
          <textarea value={message} maxLength={300} onChange={(event) => setMessage(event.target.value)} placeholder="재미있었던 빌드, 불편했던 점, 다음에 보고 싶은 카드를 알려주세요." />
          {notice && <p className="form-note">{notice}</p>}
          <button className="primary-button full" disabled={rating < 1 || message.trim().length < 2}>평가 남기기</button>
        </form>
        <div className="guestbook-list">
          {entries.map((entry) => <article key={entry.id} className="guest-entry"><header><i>{entry.authorName.slice(0,1)}</i><div><b>{entry.authorName}</b><span>{"★".repeat(entry.rating)}{"☆".repeat(5-entry.rating)}</span></div><time>{new Date(entry.createdAt).toLocaleDateString("ko-KR")}</time></header><p>{entry.message}</p></article>)}
        </div>
      </div>
    </section>
  );
}
