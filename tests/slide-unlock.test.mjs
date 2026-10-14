// D-050: the 账号 slide-to-unlock setting and the knob maths (app/slide-unlock.ts).
import assert from "node:assert/strict";
import test from "node:test";
import { SLIDE_UNLOCK_KEY, SLIDE_UNLOCK_THRESHOLD, knobOffset, readSlideUnlockOn, slideLabelOpacity, slideProgress, slideReachedEnd, writeSlideUnlockOn } from "../app/slide-unlock.ts";

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

test("the knob follows the pointer 1:1 and never leaves the track", () => {
  assert.equal(knobOffset(0, 37, 200), 37);
  assert.equal(knobOffset(50, -20, 200), 30);
  assert.equal(knobOffset(0, -15, 200), 0);
  assert.equal(knobOffset(150, 400, 200), 200);
  assert.equal(knobOffset(0, 10, 0), 0, "no track to move along");
  assert.equal(knobOffset(0, Number.NaN, 200), 0);
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
