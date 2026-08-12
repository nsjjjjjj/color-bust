"use client";

import type { RunSummary } from "./lobby";

export interface GameSelectScreenProps {
  readonly savedRun: RunSummary | null;
  readonly loading?: boolean;
  readonly onContinue: () => void;
  readonly onNewGame: () => void;
  readonly onBack: () => void;
}

function stageLabel(run: RunSummary): string {
  return `${run.ante}-${run.roundIndex}`;
}

export function GameSelectScreen({
  savedRun,
  loading = false,
  onContinue,
  onNewGame,
  onBack,
}: GameSelectScreenProps) {
  return (
    <main className="game-select-screen" aria-labelledby="game-select-title">
      <div className="game-select-backdrop" aria-hidden="true"><i /><i /><i /></div>
      <section className="game-select-panel">
        <header>
          <span>DECK MAYHEM · RUN TERMINAL</span>
          <h1 id="game-select-title">게임 선택</h1>
          <p>마지막 런을 이어가거나 새로운 스테이지 신호를 시작하세요.</p>
        </header>

        <div className="game-select-options">
          <button
            type="button"
            className="game-select-card is-continue"
            disabled={!savedRun || loading}
            onClick={onContinue}
          >
            <span className="game-select-card-icon" aria-hidden="true">▶</span>
            <span className="game-select-card-copy">
              <small>LAST RUN</small>
              <strong>이어서 하기</strong>
              {savedRun ? (
                <dl>
                  <div><dt>STAGE</dt><dd>{stageLabel(savedRun)}</dd></div>
                  <div><dt>ROUND</dt><dd>{savedRun.roundNumber}</dd></div>
                  <div><dt>COIN</dt><dd>{savedRun.coins}¢</dd></div>
                  <div><dt>POINT</dt><dd>{savedRun.score.toLocaleString()} / {savedRun.target.toLocaleString()}</dd></div>
                </dl>
              ) : (
                <p>{loading ? "저장된 런을 확인하고 있습니다…" : "이어갈 수 있는 런이 없습니다."}</p>
              )}
            </span>
          </button>

          <button type="button" className="game-select-card is-new" aria-busy={loading || undefined} onClick={onNewGame}>
            <span className="game-select-card-icon" aria-hidden="true">＋</span>
            <span className="game-select-card-copy">
              <small>NEW SIGNAL</small>
              <strong>새 게임</strong>
              <p>{loading ? "런 데이터를 확인 중입니다. 새 게임은 바로 시작할 수 있어요." : "새로운 5 STAGE 런을 시작합니다."}</p>
              {loading && <span className="game-select-loading" role="status"><i aria-hidden="true" />준비 중</span>}
              <span className="game-select-new-tags"><i>40 CARD DECK</i><i>5 STAGE</i><i>AUTO SAVE</i></span>
            </span>
          </button>
        </div>

        <footer>
          <button type="button" onClick={onBack}>← 메인 메뉴</button>
          <p>활성 런은 한 개만 저장됩니다.</p>
        </footer>
      </section>
    </main>
  );
}
