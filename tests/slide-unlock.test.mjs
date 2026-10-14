// D-051: the 账号 slide-to-unlock setting and the knob maths (app/slide-unlock.ts).
import assert from "node:assert/strict";
import test from "node:test";
import {
  SLIDE_ARM_HYSTERESIS, SLIDE_FLICK, SLIDE_PROJECTION, SLIDE_UNLOCK_KEY, SLIDE_UNLOCK_THRESHOLD, frostBlur, homeLaunchVelocity, knobPosition,
  readSlideUnlockOn, rubberBand, slideArmed, slideLabelOpacity, slideProgress, slideReachedEnd, slideReleaseUnlocks, velocityOf, writeSlideUnlockOn,
} from "../app/slide-unlock.ts";

function withStorage(store, run) {
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true, writable: true });
  try { run(); } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete globalThis.localStorage;
  }
}

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => { data.set(key, String(value)); }, data };
}

test("the setting is on unless it was turned off; its own key, never the vault", () => {
  assert.equal(SLIDE_UNLOCK_KEY, "clipbox.account-slide-unlock.v1");
  withStorage(memoryStorage(), () => assert.equal(readSlideUnlockOn(), true, "missing = on"));
  withStorage(memoryStorage({ [SLIDE_UNLOCK_KEY]: "0" }), () => assert.equal(readSlideUnlockOn(), false));
  withStorage(memoryStorage({ [SLIDE_UNLOCK_KEY]: "1" }), () => assert.equal(readSlideUnlockOn(), true));
  withStorage(memoryStorage({ [SLIDE_UNLOCK_KEY]: "maybe" }), () => assert.equal(readSlideUnlockOn(), true, "an odd value = on"));
  const store = memoryStorage();
  withStorage(store, () => {
    writeSlideUnlockOn(false);
    assert.equal(store.data.get(SLIDE_UNLOCK_KEY), "0");
    assert.equal(readSlideUnlockOn(), false);
    writeSlideUnlockOn(true);
    assert.equal(readSlideUnlockOn(), true);
    assert.deepEqual([...store.data.keys()], [SLIDE_UNLOCK_KEY]);
  });
  // Storage that throws (private window, blocked site data): on, and writing does not throw.
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  withStorage(broken, () => {
    assert.equal(readSlideUnlockOn(), true);
    assert.doesNotThrow(() => writeSlideUnlockOn(false));
  });
});

// Was "never leaves the track" (knobOffset clamped at both ends). Since the swipe-actions motion (2026-10-14) the knob
// rubber-bands past either end instead; inside the track it still follows the pointer 1:1.
test("the knob follows the pointer 1:1 along the track and rubber-bands past either end", () => {
  assert.equal(knobPosition(37, 200, 44), 37);
  assert.equal(knobPosition(30, 200, 44), 30);
  assert.equal(knobPosition(200, 200, 44), 200);
  assert.equal(knobPosition(0, 200, 44), 0);
  assert.equal(knobPosition(10, 0, 44), 0, "no track to move along");
  assert.equal(knobPosition(Number.NaN, 200, 44), 0);
  // Past the end: it still moves, by less than the pointer, and never more than the band's dimension.
  const past = knobPosition(260, 200, 44);
  assert.ok(past > 200 && past < 260, `past the end: ${past}`);
  assert.ok(knobPosition(10000, 200, 44) < 244);
  assert.ok(knobPosition(300, 200, 44) > knobPosition(260, 200, 44), "more pull, a little more travel");
  // Past the start, the same to the left.
  const before = knobPosition(-60, 200, 44);
  assert.ok(before < 0 && before > -44, `past the start: ${before}`);
  assert.ok(Math.abs(knobPosition(-60, 200, 44) + (knobPosition(260, 200, 44) - 200)) < 1e-9, "same band at both ends");
});

test("rubber band: .55 of the pull at first, then each pixel costs more, bounded by the dimension", () => {
  assert.equal(rubberBand(0, 44), 0);
  assert.equal(rubberBand(-5, 44), 0);
  assert.equal(rubberBand(10, 0), 0);
  assert.ok(Math.abs(rubberBand(1, 1000) - 0.55) < 0.01);
  assert.ok(Math.abs(rubberBand(100, 320) - (1 - 1 / (55 / 320 + 1)) * 320) < 1e-9, "same formula as arc-library");
  assert.ok(rubberBand(1e9, 44) < 44);
  assert.ok(rubberBand(40, 44) - rubberBand(20, 44) < rubberBand(20, 44) - rubberBand(0, 44));
});

test("release velocity comes from the last 80 ms of pointer samples", () => {
  assert.equal(velocityOf([]), 0);
  assert.equal(velocityOf([[100, 50]]), 0);
  assert.equal(velocityOf([[0, 0], [50, 100]]), 2000);
  // Older samples are ignored: only 200 → 260 over the last 60 ms counts.
  assert.equal(velocityOf([[0, 0], [100, 0], [140, 200], [200, 260]]), 1000);
  assert.equal(velocityOf([[0, 300], [40, 200]]), -2500);
  // Let go long after the last move: no fling.
  assert.equal(velocityOf([[0, 0], [20, 100], [400, 100]]), 0);
  assert.equal(velocityOf([[10, 0], [10, 100]]), 0, "no time passed");
});

test("arming past the threshold, with 20 px of hysteresis on the way back", () => {
  assert.equal(SLIDE_ARM_HYSTERESIS, 20);
  const max = 200, at = SLIDE_UNLOCK_THRESHOLD * max;
  assert.equal(slideArmed(at - 1, max, false), false);
  assert.equal(slideArmed(at, max, false), true);
  assert.equal(slideArmed(230, max, false), true, "rubber-banded past the end is armed");
  assert.equal(slideArmed(at - 10, max, true), true, "stays armed just below the threshold");
  assert.equal(slideArmed(at - 19, max, true), true);
  assert.equal(slideArmed(at - 21, max, true), false, "disarms 20 px below");
  assert.equal(slideArmed(at - 10, max, false), false, "but does not arm there");
  assert.equal(slideArmed(500, 0, false), false);
  assert.equal(slideArmed(Number.NaN, max, true), false);
});

test("release: opens when armed (unless flicked back) or when flung far enough; otherwise goes home", () => {
  assert.equal(SLIDE_FLICK, 900);
  assert.equal(SLIDE_PROJECTION, 0.1);
  const max = 200;
  assert.equal(slideReleaseUnlocks(190, max, 0, true), true, "armed, held still");
  assert.equal(slideReleaseUnlocks(190, max, -800, true), true, "armed, drifting back slowly");
  assert.equal(slideReleaseUnlocks(190, max, -1200, true), false, "armed, flicked back");
  assert.equal(slideReleaseUnlocks(170, max, 0, false), false, "short of the threshold, held still");
  assert.equal(slideReleaseUnlocks(120, max, 1000, false), true, "flung: 120 + 100 passes 176");
  assert.equal(slideReleaseUnlocks(60, max, 1000, false), false, "flung, but 60 + 100 falls short");
  assert.equal(slideReleaseUnlocks(60, max, 2000, false), true, "flung harder: 60 + 200");
  assert.equal(slideReleaseUnlocks(150, max, 800, false), false, "not fast enough to count as a flick");
  assert.equal(slideReleaseUnlocks(-10, max, 5000, false), false, "from behind the start");
  assert.equal(slideReleaseUnlocks(150, 0, 5000, true), false, "no track");
  assert.equal(slideReleaseUnlocks(150, max, Number.NaN, true), false);
});

test("the spring home keeps the release velocity but cannot overshoot the start", () => {
  assert.equal(homeLaunchVelocity(100, -500), -500, "slow enough to keep");
  assert.equal(homeLaunchVelocity(10, -5000), -120, "capped to 12 × the distance");
  assert.equal(homeLaunchVelocity(100, 400), 400, "moving away keeps its velocity");
  assert.equal(homeLaunchVelocity(-10, 5000), 120, "from past the start, coming back");
  assert.equal(homeLaunchVelocity(0, 300), 300);
  assert.equal(homeLaunchVelocity(50, 0), 0);
  assert.equal(homeLaunchVelocity(50, Number.NaN), 0);
});

test("the frost lightens a little with the knob and clears only on reveal", () => {
  assert.equal(frostBlur(0, 0), 16);
  assert.equal(frostBlur(SLIDE_UNLOCK_THRESHOLD, 0), 12);
  assert.equal(frostBlur(1, 0), 12);
  assert.ok(frostBlur(0.44, 0) < 16 && frostBlur(0.44, 0) > 12);
  assert.equal(frostBlur(1, 1), 0);
  assert.equal(frostBlur(0, 0.5), 8);
  assert.equal(frostBlur(-1, -1), 16);
  assert.equal(frostBlur(Number.NaN, Number.NaN), 16);
});

test("progress, the end threshold and the fading label", () => {
  assert.equal(slideProgress(0, 200), 0);
  assert.equal(slideProgress(100, 200), 0.5);
  assert.equal(slideProgress(250, 200), 1);
  assert.equal(slideProgress(10, 0), 0);
  assert.ok(SLIDE_UNLOCK_THRESHOLD >= 0.85 && SLIDE_UNLOCK_THRESHOLD <= 0.9);
  assert.equal(slideReachedEnd(slideProgress(170, 200)), false, "85 % is not far enough");
  assert.equal(slideReachedEnd(slideProgress(176, 200)), true, "88 % opens");
  assert.equal(slideReachedEnd(1), true);
  assert.equal(slideLabelOpacity(0), 1);
  assert.equal(slideLabelOpacity(0.25), 0.5);
  assert.equal(slideLabelOpacity(0.5), 0);
  assert.equal(slideLabelOpacity(1), 0);
  assert.equal(slideLabelOpacity(-1), 1);
  assert.equal(slideLabelOpacity(Number.NaN), 1);
});
