/**
 * Geometry and interaction state for a compact card hand.
 *
 * This module intentionally has no React or DOM dependency. A view measures its
 * available width (normally with ResizeObserver), asks the manager for a layout,
 * and applies the returned CSS custom properties to lightweight card wrappers.
 * Game rules and card ordering remain outside of the layout layer.
 */

export type HandLayoutVariant = "hand" | "played";

export interface HandLayoutTuning {
  readonly maximumCards: number;
  readonly cardAspectRatio: number;
  readonly minimumCardWidth: number;
  readonly maximumHandCardWidth: number;
  readonly maximumPlayedCardWidth: number;
  readonly responsiveCardWidthRatio: number;
  readonly roomyGap: number;
  readonly regularGap: number;
  readonly compactGap: number;
  readonly maximumOverlapRatio: number;
  readonly maximumFanRotation: number;
  readonly playedFanRotation: number;
  readonly maximumFanDrop: number;
  readonly hoverLift: number;
  readonly selectedLift: number;
  readonly scoreLift: number;
  readonly hoverScale: number;
  readonly selectedScale: number;
  readonly scoreScale: number;
  readonly motionDuration: number;
  readonly scoreDuration: number;
  readonly feedbackOffset: number;
}

export interface HandLayoutInput {
  readonly cardCount: number;
  readonly availableWidth: number;
  readonly variant?: HandLayoutVariant;
  /** Override for exceptional surfaces. Normal hands should use responsive sizing. */
  readonly preferredCardWidth?: number;
}

export interface HandCardLayout {
  readonly index: number;
  /** -1 at the far left, 0 at the center, and 1 at the far right. */
  readonly normalizedPosition: number;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly baseZIndex: number;
}

export interface HandLayout {
  readonly variant: HandLayoutVariant;
  readonly availableWidth: number;
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly step: number;
  readonly overlap: number;
  readonly span: number;
  readonly height: number;
  readonly topReserve: number;
  readonly isCompressed: boolean;
  readonly cards: readonly HandCardLayout[];
}

export interface HandCardInteractionState {
  readonly hovered?: boolean;
  readonly selected?: boolean;
  readonly scoring?: boolean;
  readonly reducedMotion?: boolean;
}

export interface HandCardPresentation {
  readonly lift: number;
  readonly scale: number;
  readonly zIndex: number;
  readonly shake: number;
}

export type HandCSSVariables = Record<`--hand-${string}`, string | number>;

export const DEFAULT_HAND_LAYOUT_TUNING: Readonly<HandLayoutTuning> = Object.freeze({
  maximumCards: 10,
  // The approved core card raster is exactly 94 × 140 pixels.
  cardAspectRatio: 94 / 140,
  // Keep the card readable first. Dense hands should overlap before shrinking.
  minimumCardWidth: 72,
  maximumHandCardWidth: 144,
  maximumPlayedCardWidth: 152,
  // The table reserves a wide centre lane. At eight cards, use the compact
  // cabinet size and let the cards overlap rather than growing into a row.
  responsiveCardWidthRatio: 0.13,
  roomyGap: 16,
  regularGap: 8,
  compactGap: 4,
  maximumOverlapRatio: 0.58,
  // Rotating raster-backed pixel cards forces the browser to resample their
  // frame and text. Keep cards upright and use the vertical fan drop instead.
  maximumFanRotation: 0,
  playedFanRotation: 0,
  maximumFanDrop: 10,
  hoverLift: -20,
  selectedLift: -35,
  scoreLift: -12,
  // A restrained scale gives the hand a tactile card-table response while the
  // source raster remains the single piece of card artwork.
  hoverScale: 1.07,
  selectedScale: 1.03,
  scoreScale: 1.08,
  motionDuration: 150,
  scoreDuration: 360,
  feedbackOffset: -28,
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite number greater than zero.`);
  }
}

function preferredGap(cardCount: number, tuning: HandLayoutTuning): number {
  if (cardCount <= 5) return tuning.roomyGap;
  if (cardCount <= 8) return tuning.regularGap;
  return tuning.compactGap;
}

function preferredStep(
  cardCount: number,
  cardWidth: number,
  gap: number,
  variant: HandLayoutVariant,
): number {
  if (variant !== "hand") return cardWidth + gap;
  // The starting eight-card hand should read as one fan, not eight tiny tiles.
  // Extra cards overlap a little more while every card keeps a selectable edge.
  // Eight cards use the same visibly overlapping fan as the reference table.
  // Keep the full card width; reduce the step instead of shrinking the art.
  if (cardCount === 8) return cardWidth * 0.86;
  if (cardCount === 9) return cardWidth * 0.86;
  if (cardCount >= 10) return cardWidth * 0.8;
  return cardWidth + gap;
}

function normalizedPosition(index: number, cardCount: number): number {
  if (cardCount <= 1) return 0;
  return (index - (cardCount - 1) / 2) / ((cardCount - 1) / 2);
}

function handFanRotation(cardCount: number, tuning: HandLayoutTuning): number {
  if (cardCount <= 1) return 0;
  // Two or three cards should not look more bent than a full hand.
  return Math.min(tuning.maximumFanRotation, 2.5 + (cardCount - 2) * 0.3);
}

/**
 * Immutable geometry calculator for both the player's hand and submitted cards.
 */
export class HandLayoutManager {
  readonly tuning: Readonly<HandLayoutTuning>;

  constructor(overrides: Partial<HandLayoutTuning> = {}) {
    const tuning = { ...DEFAULT_HAND_LAYOUT_TUNING, ...overrides };
    if (!Number.isInteger(tuning.maximumCards) || tuning.maximumCards < 1) {
      throw new RangeError("maximumCards must be a positive integer.");
    }
    assertFinitePositive(tuning.cardAspectRatio, "cardAspectRatio");
    assertFinitePositive(tuning.minimumCardWidth, "minimumCardWidth");
    assertFinitePositive(tuning.maximumHandCardWidth, "maximumHandCardWidth");
    assertFinitePositive(tuning.maximumPlayedCardWidth, "maximumPlayedCardWidth");
    if (tuning.maximumOverlapRatio < 0 || tuning.maximumOverlapRatio >= 1) {
      throw new RangeError("maximumOverlapRatio must be at least zero and less than one.");
    }
    this.tuning = Object.freeze(tuning);
  }

  calculate(input: HandLayoutInput): HandLayout {
    const { cardCount } = input;
    assertFinitePositive(input.availableWidth, "availableWidth");
    const availableWidth = Math.max(1, Math.floor(input.availableWidth));
    const variant = input.variant ?? "hand";

    if (!Number.isInteger(cardCount) || cardCount < 0 || cardCount > this.tuning.maximumCards) {
      throw new RangeError(`cardCount must be an integer from 0 to ${this.tuning.maximumCards}.`);
    }
    if (input.preferredCardWidth !== undefined) {
      assertFinitePositive(input.preferredCardWidth, "preferredCardWidth");
    }

    if (cardCount === 0) {
      return {
        variant,
        availableWidth,
        cardWidth: 0,
        cardHeight: 0,
        step: 0,
        overlap: 0,
        span: 0,
        height: 0,
        topReserve: 0,
        isCompressed: false,
        cards: [],
      };
    }

    const maximumCardWidth = variant === "played"
      ? this.tuning.maximumPlayedCardWidth
      : this.tuning.maximumHandCardWidth;
    const responsiveWidth = availableWidth * this.tuning.responsiveCardWidthRatio *
      (variant === "played" ? 1.1 : 1);
    const requestedWidth = input.preferredCardWidth ?? responsiveWidth;
    let cardWidth = Math.round(clamp(
      requestedWidth,
      this.tuning.minimumCardWidth,
      maximumCardWidth,
    ));
    const gap = preferredGap(cardCount, this.tuning);
    if (cardCount === 1 && cardWidth > availableWidth) {
      cardWidth = availableWidth;
    }
    const minimumStepRatio = 1 - this.tuning.maximumOverlapRatio;
    let step = cardCount === 1
      ? 0
      : preferredStep(cardCount, cardWidth, gap, variant);
    const preferredSpan = cardWidth + step * Math.max(0, cardCount - 1);
    const isCompressed = preferredSpan > availableWidth;

    if (isCompressed && cardCount > 1) {
      step = (availableWidth - cardWidth) / (cardCount - 1);
      const minimumStep = cardWidth * minimumStepRatio;

      if (step < minimumStep) {
        // Containment wins on narrow screens. The readable minimum is a target,
        // but an exceptionally small host may require a smaller card rather than
        // sending cards outside the play field.
        cardWidth = Math.floor(Math.min(
          cardWidth,
          availableWidth / (1 + (cardCount - 1) * minimumStepRatio),
        ));
        step = (availableWidth - cardWidth) / (cardCount - 1);
      }
    }

    const span = cardWidth + step * Math.max(0, cardCount - 1);
    const startX = Math.max(0, Math.round((availableWidth - span) / 2));
    const fanRotation = variant === "played"
      ? this.tuning.playedFanRotation
      : handFanRotation(cardCount, this.tuning);
    const maximumFanDrop = variant === "played" ? 0 : this.tuning.maximumFanDrop;
    const topReserve = variant === "played"
      ? Math.abs(this.tuning.scoreLift)
      : Math.abs(this.tuning.selectedLift);
    const cardHeight = Math.round(cardWidth / this.tuning.cardAspectRatio);
    const cards = Array.from({ length: cardCount }, (_, index): HandCardLayout => {
      const normalized = normalizedPosition(index, cardCount);
      return {
        index,
        normalizedPosition: normalized,
        x: Math.round(startX + index * step),
        y: Math.round(topReserve + Math.pow(Math.abs(normalized), 1.6) * maximumFanDrop),
        rotation: fanRotation === 0 ? 0 : normalized * fanRotation,
        baseZIndex: 10 + index,
      };
    });

    return {
      variant,
      availableWidth,
      cardWidth,
      cardHeight,
      step,
      overlap: Math.max(0, cardWidth - step),
      span,
      height: topReserve + cardHeight + maximumFanDrop,
      topReserve,
      isCompressed,
      cards,
    };
  }

  presentation(
    card: HandCardLayout,
    state: HandCardInteractionState = {},
  ): HandCardPresentation {
    let lift = state.selected
      ? this.tuning.selectedLift
      : state.hovered
        ? this.tuning.hoverLift
        : 0;
    if (state.scoring) lift += this.tuning.scoreLift;

    const scale = Math.max(
      1,
      state.selected ? this.tuning.selectedScale : 1,
      state.hovered ? this.tuning.hoverScale : 1,
      state.scoring ? this.tuning.scoreScale : 1,
    );
    const zBoost = state.scoring ? 100 : state.hovered ? 80 : state.selected ? 60 : 0;

    return {
      lift,
      scale,
      zIndex: card.baseZIndex + zBoost,
      shake: state.scoring && !state.reducedMotion ? 2 : 0,
    };
  }

  containerVariables(layout: HandLayout): HandCSSVariables {
    return {
      "--hand-card-width": `${layout.cardWidth}px`,
      "--hand-card-height": `${layout.cardHeight}px`,
      "--hand-card-step": `${layout.step}px`,
      "--hand-layout-span": `${layout.span}px`,
      "--hand-layout-height": `${layout.height}px`,
      "--hand-hover-lift": `${this.tuning.hoverLift}px`,
      "--hand-selected-lift": `${this.tuning.selectedLift}px`,
      "--hand-score-lift": `${this.tuning.scoreLift}px`,
      "--hand-hover-scale": this.tuning.hoverScale,
      "--hand-selected-scale": this.tuning.selectedScale,
      "--hand-score-scale": this.tuning.scoreScale,
      "--hand-motion-duration": `${this.tuning.motionDuration}ms`,
      "--hand-score-duration": `${this.tuning.scoreDuration}ms`,
      "--hand-feedback-offset": `${this.tuning.feedbackOffset}px`,
    };
  }

  cardVariables(card: HandCardLayout): HandCSSVariables {
    return {
      "--hand-card-index": card.index,
      "--hand-card-x": `${card.x}px`,
      "--hand-card-y": `${card.y}px`,
      "--hand-card-rotation": `${card.rotation}deg`,
      "--hand-card-z": card.baseZIndex,
      "--hand-card-delay": `${card.index * 18}ms`,
    };
  }

  presentationVariables(presentation: HandCardPresentation): HandCSSVariables {
    return {
      "--hand-card-lift": `${presentation.lift}px`,
      "--hand-card-scale": presentation.scale,
      "--hand-card-active-z": presentation.zIndex,
      "--hand-card-shake": `${presentation.shake}px`,
    };
  }
}

export const handLayoutManager = new HandLayoutManager();
