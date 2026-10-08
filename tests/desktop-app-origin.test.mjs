import assert from "node:assert/strict";
import test from "node:test";

import {
  WINDOWS_APP_ORIGIN,
  WINDOWS_APP_URL,
  WINDOWS_SERVER_PORT,
  isSameOriginUrl,
  isTrustedWindowsPageUrl,
  isValidServerReadyMessage,
} from "../desktop/app-origin.cjs";

test("Windows renderer uses one stable loopback origin", () => {
  assert.equal(WINDOWS_SERVER_PORT, 47183);
  assert.equal(WINDOWS_APP_ORIGIN, "http://127.0.0.1:47183");
  assert.equal(WINDOWS_APP_URL, "http://127.0.0.1:47183/?clipbox-desktop=win32");
});

test("trusted URL checks compare parsed origins instead of string prefixes", () => {
  assert.equal(isSameOriginUrl("http://127.0.0.1:47183/path", WINDOWS_APP_ORIGIN), true);
  assert.equal(isSameOriginUrl("http://127.0.0.1:47183@evil.example/", WINDOWS_APP_ORIGIN), false);
  assert.equal(isSameOriginUrl("http://127.0.0.1:47184/", WINDOWS_APP_ORIGIN), false);
  assert.equal(isSameOriginUrl("not a url", WINDOWS_APP_ORIGIN), false);
});

test("Windows top-level pages must retain the fail-closed marker", () => {
  assert.equal(isTrustedWindowsPageUrl(WINDOWS_APP_URL), true);
  assert.equal(isTrustedWindowsPageUrl(`${WINDOWS_APP_ORIGIN}/`), false);
  assert.equal(isTrustedWindowsPageUrl(`${WINDOWS_APP_ORIGIN}/?clipbox-desktop=darwin`), false);
  assert.equal(isTrustedWindowsPageUrl("http://127.0.0.1:47183@evil.example/?clipbox-desktop=win32"), false);
});

test("accepts server readiness only from the child holding the launch nonce and port", () => {
  const nonce = "expected-launch-nonce";
  assert.equal(isValidServerReadyMessage({ type: "clipbox:server-ready", nonce, port: 47183 }, nonce, 47183), true);
  assert.equal(isValidServerReadyMessage({ type: "clipbox:server-ready", nonce: "spoofed", port: 47183 }, nonce, 47183), false);
  assert.equal(isValidServerReadyMessage({ type: "clipbox:server-ready", nonce, port: 47184 }, nonce, 47183), false);
  assert.equal(isValidServerReadyMessage("clipbox:server-ready", nonce, 47183), false);
});
