"use client";

export type DisplayUnoCard = {
  id: string;
  name: string;
  creatorName?: string;
  description?: string;
  positiveLabel?: string;
  negativeLabel?: string;
  likes?: number;
  rating?: number;
  modules?: Array<{ id?: string; label?: string; points?: number }>;
};

export function UnoCard({
  card,
  selected = false,
  onSelect,
  actionLabel = "선택",
}: {
  card: DisplayUnoCard;
  selected?: boolean;
  onSelect?: () => void;
  actionLabel?: string;
}) {
  const positive =
    card.positiveLabel ?? card.modules?.find((module) => (module.points ?? 0) > 0)?.label ?? "컬러 콜 강화";
  const negative =
    card.negativeLabel ?? card.modules?.find((module) => (module.points ?? 0) < 0)?.label ?? "점수 비용";

  return (
    <article className={`uno-card${selected ? " is-selected" : ""}`}>
      <div className="uno-orbit" aria-hidden="true">
        <span>M</span>
      </div>
      <div className="uno-copy">
        <span className="uno-author">제작 {card.creatorName ?? "커뮤니티"}</span>
        <h3>{card.name}</h3>
        {card.description && <p className="uno-description">{card.description}</p>}
        <dl>
          <div className="positive"><dt>+</dt><dd>{positive}</dd></div>
          <div className="negative"><dt>−</dt><dd>{negative}</dd></div>
        </dl>
        <div className="uno-meta">
          <span>♥ {card.likes ?? 0}</span>
          <span>★ {(card.rating ?? 0).toFixed(1)}</span>
          {onSelect && (
            <button type="button" onClick={onSelect}>{selected ? "장착됨" : actionLabel}</button>
          )}
        </div>
      </div>
    </article>
  );
}
