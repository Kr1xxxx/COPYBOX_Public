import assert from "node:assert/strict";
import test from "node:test";
import {
  isTrustedCaller, parseAutomationCaller, parseTrustedCallers, trustCovers, withTrustedCaller, withoutTrustedCaller,
} from "../app/automation-trust.ts";
import { LOCAL_ONLY_KEYS } from "../app/data-transfer.ts";

const codex = { name: "codex", id: "/opt/homebrew/bin/codex" };

test("only a caller with a name and an id counts; anything else means 'cannot tell'", () => {
  assert.deepEqual(parseAutomationCaller({ name: " codex ", id: "/opt/homebrew/bin/codex", extra: 1 }), codex);
  for (const bad of [null, undefined, "codex", {}, { name: "codex" }, { name: "", id: "/x" }, { name: "x", id: 3 }, { name: "x", id: "a".repeat(2000) }]) {
    assert.equal(parseAutomationCaller(bad), null);
  }
});

test("the stored list keeps well-formed, distinct entries and drops the rest", () => {
  assert.deepEqual(parseTrustedCallers(null), []);
  assert.deepEqual(parseTrustedCallers("not json"), []);
  assert.deepEqual(parseTrustedCallers('{"id":"x"}'), []);
  const raw = JSON.stringify([{ ...codex, addedAt: 5 }, { ...codex, addedAt: 6 }, { name: "x", id: "/x" }, { name: "y", id: "/y", addedAt: "7" }]);
  assert.deepEqual(parseTrustedCallers(raw), [{ ...codex, addedAt: 5 }]);
});

test("always-allow is remembered per program and can be taken back", () => {
  const list = withTrustedCaller([], codex, 100);
  assert.equal(isTrustedCaller(list, codex), true);
  assert.equal(isTrustedCaller(list, { name: "codex", id: "/tmp/codex" }), false, "same name, another file: still asked");
  assert.equal(isTrustedCaller(list, null), false);
  assert.equal(withTrustedCaller(list, codex, 200).length, 1);
  assert.deepEqual(withoutTrustedCaller(list, codex.id), []);
});

test("always-allow covers reading and checking one 秘密, never exporting all of them", () => {
  assert.equal(trustCovers("secret-get"), true);
  assert.equal(trustCovers("secret-verify"), true);
  assert.equal(trustCovers("secret-export"), false);
});

test("the always-allow list never goes into a backup", () => {
  assert.equal(LOCAL_ONLY_KEYS.has("clipbox.automation-trusted.v1"), true);
});
