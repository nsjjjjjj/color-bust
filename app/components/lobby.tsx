"use client";

import type { CommunityUnoCard } from "../../lib/server/contracts";

export type RunSummary = {
  ante: number;
  roundLabel: string;
  score: number;
  target: number;
  mode: "standard" | "endless";
};

export function Lobby({
  savedRun,
  equippedUno,
  signedIn,
  onContinue,
  onStart,
  onOpenCommunity,
  onOpenGuide,
}: {
  savedRun: RunSummary | null;
  equippedUno?: CommunityUnoCard;
  signedIn: boolean;
  onContinue: () => void;
  onStart: (mode: "standard" | "endless") => void;
  onOpenCommunity: () => void;
  onOpenGuide: () => void;
}) {
  return (
    <main className="lobby-view">
      <section className="hero-panel">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-copy">
          <span className="kicker">A COMMUNITY-BUILT ROGUELIKE</span>
          <h1><span>COLOR</span><strong>BUST</strong></h1>
          <p className="hero-lead">네 가지 색을 조합하고, 다른 정글러가 만든 단 한 장의 UNO로 판을 뒤집으세요.</p>
          <div className="hero-actions">
            {savedRun ? (
              <button type="button" className="primary-button mega" onClick={onContinue}>
                <span>계속하기</span><small>ANTE {savedRun.ante} · {savedRun.roundLabel} · {savedRun.score.toLocaleString()} / {savedRun.target.toLocaleString()}</small>
              </button>
            ) : (
              <button type="button" className="primary-button mega" onClick={() => onStart("standard")}>
                <span>새 런 시작</span><small>5 ANTES · 약 20분</small>
              </button>
            )}
            <button type="button" className="secondary-button" onClick={() => onStart(savedRun ? "standard" : "endless")}>
              {savedRun ? "새 5 앤티" : "무한 모드"}
            </button>
            {savedRun && <button type="button" className="secondary-button" onClick={() => onStart("endless")}>무한 모드</button>}
            <button type="button" className="secondary-button" onClick={onOpenGuide}>족보와 점수표</button>
          </div>
          <p className="cloud-note"><span className={signedIn ? "cloud-on" : "cloud-off"} />{signedIn ? "클라우드 저장 활성화 · 다른 기기에서 이어하기 가능" : "게스트 모드 · 로그인하면 다른 기기에서도 이어할 수 있습니다"}</p>
        </div>
        <div className="hero-cards" aria-hidden="true">
          <div className="splash-card splash-red"><span>7</span></div>
          <div className="splash-card splash-blue"><span>7</span></div>
          <div className="splash-card splash-yellow"><span>0</span></div>
          <div className="splash-card splash-green"><span>7</span></div>
          <div className="hero-burst">×4</div>
        </div>
      </section>

      <section className="lobby-lower">
        <button className="equipped-uno-panel" type="button" onClick={onOpenCommunity}>
          <span className="kicker">NEXT RUN · COMMUNITY UNO</span>
          {equippedUno ? <><strong>{equippedUno.name}</strong><p>{equippedUno.description}</p><small>제작자 {equippedUno.creatorName} · 앤티당 1회</small></> : <><strong>커뮤니티 카드 장착</strong><p>다른 플레이어가 만든 효과 하나를 다음 런에 가져가세요.</p><small>첫 상점에 확정 등장</small></>}
          <i>→</i>
        </button>
        <article className="how-panel">
          <span className="kicker">HOW TO BUST</span>
          <ol>
            <li><b>01</b><span><strong>8장 중 최대 5장 선택</strong><small>같은 숫자와 색으로 족보 완성</small></span></li>
            <li><b>02</b><span><strong>칩 × 배수로 점수 폭발</strong><small>0은 특별하게 10 Chips</small></span></li>
            <li><b>03</b><span><strong>상점에서 빌드 완성</strong><small>조커 4칸과 특수 효과 조합</small></span></li>
          </ol>
        </article>
        <article className="daily-panel">
          <span className="kicker">TODAY&apos;S SIGNAL</span>
          <div className="signal-art"><i /><i /><i /><i /></div>
          <strong>“0을 버리지 마.”</strong>
          <p>0은 하이카드에서는 9와 같은 10 Chips. 제로 데이와 널 포인터를 만나면 빌드의 중심이 됩니다.</p>
        </article>
      </section>
    </main>
  );
}
