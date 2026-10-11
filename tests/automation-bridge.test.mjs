import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
let bridgeModule;
try {
  bridgeModule = require("../desktop/automation-bridge.cjs");
} catch {
  bridgeModule = undefined;
}

test("correlates renderer responses with the command that was sent", async () => {
  assert.equal(typeof bridgeModule?.createRendererCommandBridge, "function");
  const sent = [];
  const bridge = bridgeModule.createRendererCommandBridge({
    createId: () => "request-1",
    isReady: () => true,
    send: (request) => sent.push(request),
    timeoutMs: 100,
  });

  const pending = bridge.forward({ action: "status" });
  assert.deepEqual(sent, [{ requestId: "request-1", command: { action: "status" } }]);
  assert.equal(bridge.respond({ requestId: "wrong", response: { ok: true } }), false);
  assert.equal(bridge.respond({ requestId: "request-1", response: { ok: true, action: "status" } }), true);
  assert.deepEqual(await pending, { ok: true, action: "status" });
});

test("rejects unavailable, timed out, and closed renderer requests", async () => {
  const unavailable = bridgeModule.createRendererCommandBridge({
    createId: () => "unavailable",
    isReady: () => false,
    send: () => undefined,
  });
  await assert.rejects(unavailable.forward({ action: "status" }), (error) => error.code === "WINDOW_UNAVAILABLE");

  const timedOut = bridgeModule.createRendererCommandBridge({
    createId: () => "timeout",
    isReady: () => true,
    send: () => undefined,
    timeoutMs: 20,
  });
  await assert.rejects(timedOut.forward({ action: "status" }), (error) => error.code === "RENDERER_TIMEOUT");

  const closing = bridgeModule.createRendererCommandBridge({
    createId: () => "closing",
    isReady: () => true,
    send: () => undefined,
  });
  const pending = closing.forward({ action: "status" });
  closing.close();
  await assert.rejects(pending, (error) => error.code === "APP_CLOSING");
});

test("preload exposes only narrow automation receive and response methods", () => {
  const source = fs.readFileSync(new URL("../desktop/preload.cjs", import.meta.url), "utf8");
  const listeners = new Map();
  const sent = [];
  let exposed;
  const ipcRenderer = {
    invoke: async () => "0.2.13",
    on: (channel, listener) => listeners.set(channel, listener),
    removeListener: (channel, listener) => {
      if (listeners.get(channel) === listener) listeners.delete(channel);
    },
    send: (channel, payload) => sent.push({ channel, payload }),
  };
  const sandbox = {
    window: new EventTarget(),
    process: { platform: "win32" },
    require: (name) => {
      assert.equal(name, "electron");
      return {
        contextBridge: { exposeInMainWorld: (_name, value) => { exposed = value; } },
        ipcRenderer,
      };
    },
  };
  vm.runInNewContext(source, sandbox, { filename: "preload.cjs" });

  assert.equal(typeof exposed.onAutomationCommand, "function");
  assert.equal(typeof exposed.respondAutomationCommand, "function");
  assert.equal(typeof exposed.automationReady, "function");
  assert.equal(exposed.send, undefined);
  assert.equal(sent.length, 0);
  let received;
  const remove = exposed.onAutomationCommand((request) => { received = request; });
  exposed.automationReady();
  assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))), { channel: "clipbox:automation-ready" });
  listeners.get("clipbox:automation-command")({}, { requestId: "one", command: { action: "status" } });
  exposed.respondAutomationCommand("one", { ok: true });
  assert.deepEqual(received, { requestId: "one", command: { action: "status" } });
  assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))), { channel: "clipbox:automation-response", payload: { requestId: "one", response: { ok: true } } });
  remove();
  assert.equal(listeners.has("clipbox:automation-command"), false);
});

test("a quiet start has no window yet: the bridge asks for one before it gives up", async () => {
  let ready = false;
  const sent = [];
  const bridge = bridgeModule.createRendererCommandBridge({
    createId: () => "request-2",
    isReady: () => ready,
    send: (request) => sent.push(request),
    ensureReady: async () => { ready = true; },
    timeoutMs: 100,
  });
  const pending = bridge.forward({ action: "status" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(sent, [{ requestId: "request-2", command: { action: "status" } }]);
  bridge.respond({ requestId: "request-2", response: { ok: true } });
  assert.deepEqual(await pending, { ok: true });
});

test("still reports the window as unavailable when it cannot be opened", async () => {
  const bridge = bridgeModule.createRendererCommandBridge({
    createId: () => "request-3",
    isReady: () => false,
    send() {},
    ensureReady: async () => { throw new Error("no server"); },
  });
  await assert.rejects(bridge.forward({ action: "status" }), { code: "WINDOW_UNAVAILABLE" });
});
