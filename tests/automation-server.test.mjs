import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
let automationServer;
try {
  automationServer = require("../desktop/automation-server.cjs");
} catch {
  automationServer = undefined;
}

function temporarySocket() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "clipbox-automation-"));
  return { directory, socketPath: path.join(directory, "automation.sock") };
}

function sendRaw(socketPath, payload, end = true) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let response = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(payload);
      if (end) socket.end();
    });
    socket.on("data", (chunk) => { response += chunk; });
    socket.on("end", () => resolve(response.trim()));
    socket.on("error", reject);
  });
}

async function sendRequest(socketPath, value) {
  return JSON.parse(await sendRaw(socketPath, `${JSON.stringify(value)}\n`));
}

test("serves one JSON request through an owner-only Unix socket", async () => {
  assert.equal(typeof automationServer?.createAutomationServer, "function");
  const temporary = temporarySocket();
  const server = automationServer.createAutomationServer({
    socketPath: temporary.socketPath,
    forward: async (command) => ({ ok: true, action: command.action }),
  });
  try {
    await server.start();
    assert.equal(fs.statSync(temporary.directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(temporary.socketPath).mode & 0o777, 0o600);
    assert.deepEqual(await sendRequest(temporary.socketPath, { action: "status" }), { ok: true, action: "status" });
  } finally {
    await server.close();
    assert.equal(fs.existsSync(temporary.socketPath), false);
    fs.rmSync(temporary.directory, { recursive: true, force: true });
  }
});

test("returns protocol errors for malformed and oversized requests", async () => {
  const temporary = temporarySocket();
  const server = automationServer.createAutomationServer({
    socketPath: temporary.socketPath,
    maxBytes: 32,
    forward: async () => ({ ok: true }),
  });
  try {
    await server.start();
    const malformed = JSON.parse(await sendRaw(temporary.socketPath, "not-json\n"));
    const oversized = JSON.parse(await sendRaw(temporary.socketPath, `${"x".repeat(40)}\n`));
    assert.equal(malformed.error.code, "INVALID_JSON");
    assert.equal(oversized.error.code, "REQUEST_TOO_LARGE");
  } finally {
    await server.close();
    fs.rmSync(temporary.directory, { recursive: true, force: true });
  }
});

test("forwards failures and renderer timeouts as stable error responses", async () => {
  const rejectedTemporary = temporarySocket();
  const rejected = automationServer.createAutomationServer({
    socketPath: rejectedTemporary.socketPath,
    forward: async () => { throw Object.assign(new Error("Vault busy"), { code: "VAULT_BUSY" }); },
  });
  try {
    await rejected.start();
    const response = await sendRequest(rejectedTemporary.socketPath, { action: "status" });
    assert.deepEqual(response, { ok: false, error: { code: "VAULT_BUSY", message: "Vault busy" } });
  } finally {
    await rejected.close();
    fs.rmSync(rejectedTemporary.directory, { recursive: true, force: true });
  }

  const timeoutTemporary = temporarySocket();
  const timeout = automationServer.createAutomationServer({
    socketPath: timeoutTemporary.socketPath,
    timeoutMs: 30,
    forward: async () => new Promise(() => {}),
  });
  try {
    await timeout.start();
    const response = await sendRequest(timeoutTemporary.socketPath, { action: "status" });
    assert.equal(response.error.code, "RENDERER_TIMEOUT");
  } finally {
    await timeout.close();
    fs.rmSync(timeoutTemporary.directory, { recursive: true, force: true });
  }
});

test("removes a stale socket path before listening", async () => {
  const temporary = temporarySocket();
  fs.writeFileSync(temporary.socketPath, "stale");
  const server = automationServer.createAutomationServer({
    socketPath: temporary.socketPath,
    forward: async () => ({ ok: true }),
  });
  try {
    await server.start();
    assert.equal(fs.statSync(temporary.socketPath).isSocket(), true);
  } finally {
    await server.close();
    fs.rmSync(temporary.directory, { recursive: true, force: true });
  }
});
