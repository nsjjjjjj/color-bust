"use client";

import type { CommunityUnoCard } from "../../lib/server/contracts";

export type RunSummary = {
  ante: number;
  roundLabel: string;
  score: number;
  target: number;
  mode: "standard" | "endless";
};

export interface LobbyProps {
  savedRun: RunSummary | null;
  equippedUno?: CommunityUnoCard;
  signedIn: boolean;
  onContinue: () => void;
  onStart: (mode: "standard" | "endless") => void;
  onOpenCommunity: () => void;
  onOpenGuide: () => void;
  onOpenSettings: () => void;
  onOpenLeaderboard: () => void;
  onOpenGuestbook: () => void;
}

export function Lobby({
  savedRun,
  equippedUno,
  signedIn,
  onContinue,
  onStart,
  onOpenCommunity,
  onOpenGuide,
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

      <p className="mobile-menu-cloud" role="status">
        <span className={signedIn ? "cloud-on" : "cloud-off"} aria-hidden="true" />
        {signedIn ? "CLOUD SAVE · 다른 기기에서 이어하기 가능" : "GUEST · 로그인하면 클라우드 저장 활성화"}
      </p>

      <section className="mobile-menu-brand" aria-labelledby="mobile-menu-title">
        <span className="kicker">A COMMUNITY-BUILT ROGUELIKE</span>
        <h1 id="mobile-menu-title"><span>COLOR</span><strong>BUST</strong></h1>
        <p>색을 맞추고, 족보를 터뜨리고, 단 한 장의 UNO로 판을 뒤집으세요.</p>
        <div className="mobile-menu-logo-pips" aria-hidden="true"><i /><i /><i /><i /></div>
      </section>

      <nav className="mobile-menu-primary" aria-label="메인 메뉴">
        <button
          type="button"
          className="mobile-menu-button mobile-menu-play"
          onClick={savedRun ? onContinue : () => onStart("standard")}
        >
          <span>플레이</span>
          <small>
            {savedRun
              ? `이어하기 · ANTE ${savedRun.ante} · ${savedRun.roundLabel} · ${savedRun.score.toLocaleString()} / ${savedRun.target.toLocaleString()}`
              : "새 런 시작 · 5앤티 · 약 20분"}
          </small>
        </button>
        <button type="button" className="mobile-menu-button mobile-menu-options" onClick={onOpenSettings}>
          <span>옵션</span><small>계정 · 오디오 · 클라우드</small>
        </button>
        <button type="button" className="mobile-menu-button mobile-menu-collection" onClick={onOpenCommunity}>
          <span>컬렉션</span><small>커뮤니티 UNO 연구소</small>
        </button>
      </nav>

      <nav className="mobile-menu-utility" aria-label="게임 모드와 참고 정보">
        <button type="button" onClick={() => onStart("standard")}><b>5앤티</b><span>STANDARD</span></button>
        <button type="button" onClick={() => onStart("endless")}><b>무한</b><span>ENDLESS</span></button>
        <button type="button" onClick={onOpenGuide}><b>족보</b><span>HAND GUIDE</span></button>
        <button type="button" onClick={onOpenLeaderboard}><b>랭킹</b><span>RANKING</span></button>
        <button type="button" onClick={onOpenGuestbook}><b>평가</b><span>GUESTBOOK</span></button>
      </nav>

      <button className="mobile-menu-uno" type="button" onClick={onOpenCommunity}>
        <span className="kicker">EQUIPPED · COMMUNITY UNO</span>
        {equippedUno ? (
          <>
            <strong>{equippedUno.name}</strong>
            <p>{equippedUno.description}</p>
            <small>{equippedUno.creatorName} 제작 · 앤티당 1회</small>
          </>
        ) : (
          <>
            <strong>장착된 UNO 없음</strong>
            <p>다른 플레이어의 카드를 다음 런 첫 상점에 예약하세요.</p>
            <small>컬렉션 열기 →</small>
          </>
        )}
      </button>

      <section className="mobile-menu-support" aria-label="게임 도움말과 오늘의 팁">
        <article className="mobile-menu-how">
          <span className="kicker">HOW TO BUST</span>
          <ol>
            <li><b>01</b><span><strong>8장 중 최대 5장 선택</strong><small>숫자와 색으로 족보 완성</small></span></li>
            <li><b>02</b><span><strong>Chips × Mult</strong><small>0은 특별하게 10 Chips</small></span></li>
            <li><b>03</b><span><strong>상점에서 빌드 완성</strong><small>조커와 UNO 효과 조합</small></span></li>
          </ol>
        </article>
        <article className="mobile-menu-signal">
          <span className="kicker">TODAY&apos;S SIGNAL</span>
          <div className="signal-art" aria-hidden="true"><i /><i /><i /><i /></div>
          <strong>“0을 버리지 마.”</strong>
          <p>0은 10 Chips. 제로 데이와 널 포인터를 만나면 빌드의 중심이 됩니다.</p>
        </article>
      </section>
    </main>
  );
}
