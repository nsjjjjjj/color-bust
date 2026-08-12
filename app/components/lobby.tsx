"use client";

import type { CommunityUnoCard } from "../../lib/server/contracts";
import { ColorCard, type DisplayNumberCard } from "./color-card";

const LOBBY_LOGO_CARDS: readonly DisplayNumberCard[] = [
  { id: "lobby-red-7", color: "red", value: 7 },
  { id: "lobby-yellow-2", color: "yellow", value: 2 },
  { id: "lobby-green-0", color: "green", value: 0 },
  { id: "lobby-blue-9", color: "blue", value: 9 },
];

export type RunSummary = {
  ante: number;
  roundIndex: number;
  roundNumber: number;
  roundLabel: string;
  score: number;
  target: number;
  coins: number;
  mode: "standard" | "endless";
};

export interface LobbyProps {
  savedRun: RunSummary | null;
  equippedUno?: CommunityUnoCard;
  signedIn: boolean;
  online: boolean;
  onPlay: () => void;
  onOpenCommunity: () => void;
  onOpenAccount: () => void;
  onOpenSettings: () => void;
  onOpenLeaderboard: () => void;
  onOpenGuestbook: () => void;
}

export function Lobby({
  savedRun,
  equippedUno,
  signedIn,
  online,
  onPlay,
  onOpenCommunity,
  onOpenAccount,
  onOpenSettings,
  onOpenLeaderboard,
  onOpenGuestbook,
}: LobbyProps) {
  return (
    <main className="lobby-view mobile-menu-screen">
      <div className="mobile-menu-background" aria-hidden="true">
        <i className="mobile-menu-shape mobile-menu-shape-red" />
        <i className="mobile-menu-shape mobile-menu-shape-blue" />
        <i className="mobile-menu-shape mobile-menu-shape-orbit" />
        <span className="mobile-menu-noise" />
      </div>

      <div className="mobile-menu-connectivity">
        <button type="button" className="mobile-menu-feedback" onClick={onOpenGuestbook} aria-label="평가소 열기">
          <b aria-hidden="true">★</b><span>평가소</span>
        </button>
        <p className="mobile-menu-cloud" data-online={online || undefined} role="status">
          <span className="mobile-menu-status-light" aria-hidden="true" />
          <strong>{online ? "온라인" : "오프라인"}</strong>
        </p>
      </div>

      <button type="button" className="mobile-menu-profile" onClick={onOpenAccount} aria-label="프로필과 계정 열기">
        <span className="mobile-menu-profile-avatar" aria-hidden="true"><i /><i /><i /></span>
        <span><b>{signedIn ? "플레이어" : "게스트"}</b><small>1P</small></span>
      </button>

      <div className="mobile-menu-side-controls" aria-label="빠른 메뉴">
        <button type="button" className="mobile-menu-ranking" onClick={onOpenLeaderboard} aria-label="랭킹 열기"><b aria-hidden="true">♛</b><small>랭킹</small></button>
      </div>

      <section className="mobile-menu-brand" aria-labelledby="mobile-menu-title">
        <span className="kicker">모두가 함께 만드는 카드 로그라이크</span>
        <div className="deck-mayhem-lockup">
          <div className="deck-mayhem-card-fan" aria-hidden="true">
            <span className="deck-logo-card-slot deck-logo-red">
              <ColorCard card={LOBBY_LOGO_CARDS[0]} displayOnly />
            </span>
            <span className="deck-logo-card-slot deck-logo-yellow">
              <ColorCard card={LOBBY_LOGO_CARDS[1]} displayOnly />
            </span>
            <span className="deck-logo-card-slot deck-logo-back"><i /></span>
            <span className="deck-logo-card-slot deck-logo-green">
              <ColorCard card={LOBBY_LOGO_CARDS[2]} displayOnly />
            </span>
            <span className="deck-logo-card-slot deck-logo-blue">
              <ColorCard card={LOBBY_LOGO_CARDS[3]} displayOnly />
            </span>
          </div>
          <h1 id="mobile-menu-title"><span>DECK</span><strong>MAYHEM</strong></h1>
        </div>
        <p>색깔 숫자 카드로 족보를 만들고, 단 한 장의 메이헴 카드로 덱을 뒤집으세요.</p>
      </section>

      <nav className="mobile-menu-primary" aria-label="메인 메뉴">
        <button
          type="button"
          className="mobile-menu-button mobile-menu-play"
          onClick={onPlay}
        >
          <span>플레이</span>
          <small>
            {savedRun
              ? `게임 선택 · 저장된 STAGE ${savedRun.ante}-${savedRun.roundIndex} 런 있음`
              : "게임 선택 · 새 5 STAGE 런"}
          </small>
        </button>
        <button type="button" className="mobile-menu-button mobile-menu-options" onClick={onOpenSettings}>
          <span>옵션</span><small>화면 · 오디오 · 접근성</small>
        </button>
        <button type="button" className="mobile-menu-button mobile-menu-collection" onClick={onOpenCommunity}>
          <span>컬렉션</span><small>커뮤니티 메이헴 연구소</small>
        </button>
      </nav>

      <button className="mobile-menu-uno" type="button" onClick={onOpenCommunity}>
        <span className="kicker">장착 중 · 메이헴 카드</span>
        {equippedUno ? (
          <>
            <strong>{equippedUno.name}</strong>
            <p>{equippedUno.description}</p>
            <small>{equippedUno.creatorName} 제작 · 스테이지당 1회</small>
          </>
        ) : (
          <>
            <strong>장착된 메이헴 카드 없음</strong>
            <p>다른 플레이어의 카드를 다음 런 첫 상점에 예약하세요.</p>
            <small>컬렉션 열기 →</small>
          </>
        )}
      </button>

      <section className="mobile-menu-support" aria-label="게임 도움말과 오늘의 팁">
        <article className="mobile-menu-how">
          <span className="kicker">플레이 방법</span>
          <ol>
            <li><b>01</b><span><strong>8장 중 최대 5장 선택</strong><small>숫자와 색으로 족보 완성</small></span></li>
            <li><b>02</b><span><strong>칩 × 배수</strong><small>0은 특별하게 10칩</small></span></li>
            <li><b>03</b><span><strong>상점에서 빌드 완성</strong><small>조커와 메이헴 효과 조합</small></span></li>
          </ol>
        </article>
        <article className="mobile-menu-signal">
          <span className="kicker">오늘의 신호</span>
          <div className="signal-art" aria-hidden="true"><i /><i /><i /><i /></div>
          <strong>“0을 버리지 마.”</strong>
          <p>0은 10칩. 제로 데이와 널 포인터를 만나면 빌드의 중심이 됩니다.</p>
        </article>
      </section>
    </main>
  );
}
