import assert from "node:assert/strict";
import test from "node:test";
import {
  HandLayoutManager,
  handLayoutManager,
} from "../lib/ui/hand-layout";

const closeTo = (actual: number, expected: number, tolerance = 0.000_001) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test("centers a single upright card", () => {
  const layout = handLayoutManager.calculate({ cardCount: 1, availableWidth: 1000 });
  assert.equal(layout.cards.length, 1);
  assert.equal(layout.cardWidth, 132);
  closeTo(layout.cards[0].x, (1000 - 132) / 2);
  assert.equal(layout.cards[0].rotation, 0);
  assert.equal(layout.cards[0].normalizedPosition, 0);

  const narrow = handLayoutManager.calculate({ cardCount: 1, availableWidth: 40 });
  assert.equal(narrow.cardWidth, 40);
  assert.equal(narrow.cards[0].x, 0);
});

test("uses gaps for small groups and deliberate overlap for a full hand", () => {
  const manager = new HandLayoutManager({ responsiveCardWidthRatio: 1 });
  const five = manager.calculate({ cardCount: 5, availableWidth: 2000 });
  const six = manager.calculate({ cardCount: 6, availableWidth: 2000 });
  const eight = manager.calculate({ cardCount: 8, availableWidth: 2000 });
  const nine = manager.calculate({ cardCount: 9, availableWidth: 2000 });
  const ten = manager.calculate({ cardCount: 10, availableWidth: 2000 });

  closeTo(five.step - five.cardWidth, 16);
  closeTo(six.step - six.cardWidth, 8);
  closeTo(eight.step / eight.cardWidth, 0.92);
  closeTo(nine.step / nine.cardWidth, 0.86);
  closeTo(ten.step / ten.cardWidth, 0.8);
});

test("keeps cards readable by increasing overlap before shrinking", () => {
  const layout = handLayoutManager.calculate({ cardCount: 10, availableWidth: 320 });
  const phoneLandscape = handLayoutManager.calculate({ cardCount: 10, availableWidth: 334 });

  assert.equal(layout.cardWidth, 64);
  assert.ok(layout.overlap > layout.cardWidth / 2);
  closeTo(layout.span, 320);
  assert.equal(phoneLandscape.cardWidth, 64);
  assert.ok(phoneLandscape.step >= 30);
  closeTo(phoneLandscape.span, 334);
});

test("keeps ten cards inside the measured hand width", () => {
  for (const availableWidth of [320, 568, 960, 1280]) {
    const layout = handLayoutManager.calculate({ cardCount: 10, availableWidth });
    const first = layout.cards[0];
    const last = layout.cards.at(-1);
    assert.ok(first.x >= -Number.EPSILON);
    assert.ok(last);
    assert.ok(last.x + layout.cardWidth <= availableWidth + Number.EPSILON * 8);
    assert.ok(layout.cards.every((card, index, cards) => index === 0 || card.x > cards[index - 1].x));
  }
});

test("builds a symmetric mild fan without bending the center", () => {
  const layout = handLayoutManager.calculate({ cardCount: 9, availableWidth: 1200 });
  const center = layout.cards[4];
  assert.equal(center.rotation, 0);
  closeTo(center.y, layout.topReserve);
  closeTo(layout.cards[0].rotation, -layout.cards[8].rotation);
  closeTo(layout.cards[0].y, layout.cards[8].y);
  assert.ok(Math.abs(layout.cards[0].rotation) <= 5);
});

test("played cards are larger, nearly straight, and reserve scoring lift", () => {
  const hand = handLayoutManager.calculate({ cardCount: 5, availableWidth: 1200 });
  const played = handLayoutManager.calculate({ cardCount: 5, availableWidth: 1200, variant: "played" });

  assert.ok(played.cardWidth > hand.cardWidth);
  assert.ok(Math.abs(played.cards[0].rotation) < Math.abs(hand.cards[0].rotation));
  assert.equal(played.cards[0].y, Math.abs(handLayoutManager.tuning.scoreLift));
});

test("selection wins vertical position while scoring adds feedback emphasis", () => {
  const card = handLayoutManager.calculate({ cardCount: 5, availableWidth: 900 }).cards[2];
  const hover = handLayoutManager.presentation(card, { hovered: true });
  const selectedHover = handLayoutManager.presentation(card, { selected: true, hovered: true });
  const scoring = handLayoutManager.presentation(card, { selected: true, scoring: true });
  const reduced = handLayoutManager.presentation(card, { scoring: true, reducedMotion: true });

  assert.equal(hover.lift, -20);
  assert.equal(selectedHover.lift, -35);
  assert.equal(scoring.lift, -47);
  assert.equal(scoring.scale, 1.08);
  assert.equal(scoring.shake, 2);
  assert.equal(reduced.shake, 0);
  assert.ok(scoring.zIndex > selectedHover.zIndex);
});

test("exposes stable CSS variables for a thin view adapter", () => {
  const layout = handLayoutManager.calculate({ cardCount: 3, availableWidth: 800 });
  const container = handLayoutManager.containerVariables(layout);
  const card = handLayoutManager.cardVariables(layout.cards[1]);
  const active = handLayoutManager.presentationVariables(
    handLayoutManager.presentation(layout.cards[1], { selected: true }),
  );

  assert.equal(container["--hand-selected-lift"], "-35px");
  assert.equal(container["--hand-hover-scale"], 1.07);
  assert.equal(card["--hand-card-rotation"], "0deg");
  assert.equal(active["--hand-card-lift"], "-35px");
  assert.equal(active["--hand-card-active-z"], layout.cards[1].baseZIndex + 60);
});

test("rejects impossible public inputs instead of producing NaN geometry", () => {
  assert.throws(
    () => handLayoutManager.calculate({ cardCount: 11, availableWidth: 900 }),
    /cardCount/,
  );
  assert.throws(
    () => handLayoutManager.calculate({ cardCount: 5, availableWidth: 0 }),
    /availableWidth/,
  );
});
