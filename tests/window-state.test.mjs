import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
let windowState;
try {
  windowState = require("../desktop/window-state.cjs");
} catch {
  windowState = undefined;
}

const workAreas = [
  { x: 0, y: 0, width: 1440, height: 900 },
  { x: 1440, y: -120, width: 1920, height: 1080 },
];

test("restores valid bounds that remain visible on a connected display", () => {
  assert.equal(typeof windowState?.normalizeWindowBounds, "function");
  assert.deepEqual(
    windowState.normalizeWindowBounds(
      { x: 1710, y: 40, width: 760, height: 660 },
      workAreas,
    ),
    { x: 1710, y: 40, width: 760, height: 660 },
  );
});

test("falls back to the default size for off-screen or malformed bounds", () => {
  assert.equal(typeof windowState?.normalizeWindowBounds, "function");
  assert.deepEqual(
    windowState.normalizeWindowBounds(
      { x: 5000, y: 3000, width: 760, height: 660 },
      workAreas,
    ),
    { width: 680, height: 620 },
  );
  assert.deepEqual(
    windowState.normalizeWindowBounds(
      { x: 100, y: 100, width: "760", height: 660 },
      workAreas,
    ),
    { width: 680, height: 620 },
  );
});

test("saves and reloads window bounds while recovering from corrupt JSON", () => {
  assert.equal(typeof windowState?.createWindowStateStore, "function");
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "clipbox-window-state-"));
  const filePath = path.join(temporaryDirectory, "window-state.json");
  const store = windowState.createWindowStateStore({
    filePath,
    getWorkAreas: () => workAreas,
  });

  try {
    const bounds = { x: 210, y: 130, width: 820, height: 680 };
    store.save(bounds);
    assert.deepEqual(store.load(), bounds);

    fs.writeFileSync(filePath, "not-json");
    assert.deepEqual(store.load(), { width: 680, height: 620 });
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("rejects stored full-window sizes below the 680×620 minimum", () => {
  assert.deepEqual(
    windowState.normalizeWindowBounds({ x: 100, y: 100, width: 600, height: 620 }, workAreas),
    { width: 680, height: 620 },
  );
  assert.deepEqual(
    windowState.normalizeWindowBounds({ x: 100, y: 100, width: 680, height: 600 }, workAreas),
    { width: 680, height: 620 },
  );
  assert.equal(windowState.MIN_WINDOW_WIDTH, 680);
  assert.equal(windowState.MIN_WINDOW_HEIGHT, 620);
});

test("remembers only a visible position for the fixed-size mini window", () => {
  assert.deepEqual(windowState.MINI_WINDOW_SIZE, { width: 360, height: 440 });
  assert.deepEqual(windowState.normalizeMiniWindowPosition({ x: 1000.4, y: 40 }, workAreas), { x: 1000, y: 40 });
  assert.equal(windowState.normalizeMiniWindowPosition({ x: 9000, y: 9000 }, workAreas), null);
  assert.equal(windowState.normalizeMiniWindowPosition({ x: "1", y: 40 }, workAreas), null);

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "clipbox-mini-state-"));
  const filePath = path.join(temporaryDirectory, "mini-window-state.json");
  const store = windowState.createMiniWindowStore({ filePath, getWorkAreas: () => workAreas });
  try {
    assert.equal(store.load(), null);
    assert.equal(store.save({ x: 300, y: 120 }), true);
    assert.deepEqual(store.load(), { x: 300, y: 120 });
    assert.equal(store.save({ x: 9000, y: 9000 }), false);
    assert.deepEqual(store.load(), { x: 300, y: 120 });
    fs.writeFileSync(filePath, "not-json");
    assert.equal(store.load(), null);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
