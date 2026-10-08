import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const electron = require("electron");
const execFileAsync = promisify(execFile);

test("the real preload exposes its bridge inside an Electron sandbox", { timeout: 20_000 }, async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const { stdout } = await execFileAsync(electron, ["tests/fixtures/electron-preload-sandbox.cjs"], {
    cwd: new URL("..", import.meta.url),
    env,
    timeout: 15_000,
  });
  const line = stdout.split("\n").find((value) => value.startsWith("CLIPBOX_PRELOAD_RESULT="));
  assert.ok(line, `Electron fixture did not return preload data:\n${stdout}`);
  const result = JSON.parse(line.slice("CLIPBOX_PRELOAD_RESULT=".length));

  assert.equal(result.bridgeType, "object");
  assert.equal(result.didCopyType, "function");
  assert.equal(result.capabilities?.platform, process.platform === "win32" ? "win32" : "darwin");
});
