"use client";

import { JOKER_ART } from "../../lib/game/special-card-art";
import type { JokerId } from "../../lib/game/types";

export type DisplayJoker = {
  id: string;
  name: string;
  description: string;
  rarity?: "common" | "uncommon" | "rare";
  price?: number;
  jokerId?: JokerId;
};

const RARITY_LABEL = { common: "일반", uncommon: "고급", rare: "희귀" } as const;

export function JokerCard({
  joker,
  compact = false,
  actionLabel,
  disabled,
  onAction,
}: {
  joker: DisplayJoker;
  compact?: boolean;
  actionLabel?: string;
  disabled?: boolean;
  onAction?: () => void;
}) {
  const rarity = joker.rarity ?? "common";
  return (
    <article className={`joker-card rarity-${rarity}${compact ? " is-compact" : ""}`}>
      <div className="joker-art" aria-hidden="true">
        {joker.jokerId ? <img className="special-card-art" src={JOKER_ART[joker.jokerId]} alt="" /> : <><span>{joker.name.slice(0, 1)}</span><i /></>}
      </div>
      <div className="joker-copy">
        <div className="eyebrow-row">
          <span>{RARITY_LABEL[rarity]}</span>
          {typeof joker.price === "number" && <b>{joker.price}¢</b>}
        </div>
        <h3>{joker.name}</h3>
        <p>{joker.description}</p>
      </div>
      {actionLabel && (
        <button type="button" className="small-action" disabled={disabled} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </article>
  );
}
