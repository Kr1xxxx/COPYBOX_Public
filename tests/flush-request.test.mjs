import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { createFlushRequester } = require("../desktop/flush-request.cjs");

test("resolves true when the page answers", async () => {
  const sent = [];
  const requester = createFlushRequester({ canRequest: () => true, send: () => sent.push("flush"), timeoutMs: 1000 });
  const pending = requester.request();
  assert.deepEqual(sent, ["flush"]);
  requester.done();
  assert.equal(await pending, true);
});

test("gives up after the timeout so quitting is never blocked", async () => {
  const requester = createFlushRequester({ canRequest: () => true, send() {}, timeoutMs: 20 });
  assert.equal(await requester.request(), false);
});

test("does not ask when there is no loaded page", async () => {
  let asked = false;
  const requester = createFlushRequester({ canRequest: () => false, send: () => { asked = true; } });
  assert.equal(await requester.request(), false);
  assert.equal(asked, false);
});

test("several waiters are all released by one answer", async () => {
  const requester = createFlushRequester({ canRequest: () => true, send() {}, timeoutMs: 1000 });
  const both = Promise.all([requester.request(), requester.request()]);
  requester.done();
  assert.deepEqual(await both, [true, true]);
});
