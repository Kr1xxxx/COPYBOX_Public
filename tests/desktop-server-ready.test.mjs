import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { rename } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("prepared desktop server proves successful port ownership over IPC", { timeout: 30_000 }, async () => {
  await import(new URL(`../desktop/prepare-standalone.mjs?test=${Date.now()}`, import.meta.url));

  const runtime = path.join(root, "dist", "desktop-standalone");
  await rename(path.join(runtime, "modules"), path.join(runtime, "node_modules"));
  const nonce = `server-ready-${process.pid}`;
  const child = fork(path.join(runtime, "server.js"), [], {
    cwd: runtime,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: "0",
      NODE_ENV: "production",
      CLIPBOX_SERVER_NONCE: nonce,
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });

  try {
    const message = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for server readiness IPC")), 20_000);
      child.once("error", reject);
      child.once("exit", (code) => reject(new Error(`Desktop server exited before readiness (${code})`)));
      child.on("message", (value) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
    assert.equal(message.type, "clipbox:server-ready");
    assert.equal(message.nonce, nonce);
    assert.ok(Number.isInteger(message.port) && message.port > 0);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await rename(path.join(runtime, "node_modules"), path.join(runtime, "modules"));
  }
});
