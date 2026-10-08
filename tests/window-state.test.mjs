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
