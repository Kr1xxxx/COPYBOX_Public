import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const electron = require("electron");
const execFileAsync = promisify(execFile);

async function launch(phase, userData) {
  const env = { ...process.env, CLIPBOX_TEST_PHASE: phase, CLIPBOX_TEST_USER_DATA: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  const { stdout } = await execFileAsync(electron, ["tests/fixtures/electron-stable-origin.cjs"], {
    cwd: new URL("..", import.meta.url),
    env,
    timeout: 20_000,
  });
  const line = stdout.split("\n").find((value) => value.startsWith("CLIPBOX_STORAGE_RESULT="));
  assert.ok(line, `Electron fixture did not report storage data:\n${stdout}`);
  return JSON.parse(line.slice("CLIPBOX_STORAGE_RESULT=".length));
}

test("local vault storage survives two Windows-shell launches", { timeout: 45_000 }, async () => {
  const userData = await mkdtemp(path.join(tmpdir(), "clipbox-stable-origin-"));
  try {
    assert.equal(await launch("write", userData), "survives");
    assert.equal(await launch("read", userData), "survives");
  } finally {
    await rm(userData, { recursive: true, force: true });
  }
});
