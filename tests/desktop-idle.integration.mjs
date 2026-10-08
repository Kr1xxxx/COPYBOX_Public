import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);

test("desktop rests without animation, preserves drafts and IPC, and wakes on interaction", { timeout: 75_000 }, async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const { stdout } = await promisify(execFile)(require("electron"), ["tests/fixtures/electron-idle.cjs"], {
    cwd: new URL("..", import.meta.url), env, timeout: 70_000,
  });
  assert.match(stdout, /CLIPBOX_IDLE_OK/);
});
