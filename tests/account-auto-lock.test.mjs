// D-070: the 账号 page auto-lock setting and when its countdown runs (app/account-auto-lock.ts).
import assert from "node:assert/strict";
import test from "node:test";
import { AUTO_LOCK_DEFAULT, AUTO_LOCK_KEY, AUTO_LOCK_OPTIONS, autoLockHint, autoLockLabel, autoLockRunning, readAutoLockSeconds, writeAutoLockSeconds } from "../app/account-auto-lock.ts";

function withStorage(initial, run) {
  const data = new Map(Object.entries(initial));
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => { data.set(key, String(value)); } }, configurable: true, writable: true });
  try { run(data); } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete globalThis.localStorage;
  }
}

test("auto-lock offers 10 / 20 / 30 秒 and 不上锁, 20 秒 by default", () => {
  assert.deepEqual([...AUTO_LOCK_OPTIONS], [10, 20, 30, 0]);
  assert.equal(AUTO_LOCK_DEFAULT, 20);
  assert.deepEqual(AUTO_LOCK_OPTIONS.map(autoLockLabel), ["10 秒", "20 秒", "30 秒", "不上锁"]);
  withStorage({}, () => assert.equal(readAutoLockSeconds(), 20));
  withStorage({ [AUTO_LOCK_KEY]: "15" }, () => assert.equal(readAutoLockSeconds(), 20));
  withStorage({ [AUTO_LOCK_KEY]: "nonsense" }, () => assert.equal(readAutoLockSeconds(), 20));
});

test("the choice is remembered, 不上锁 included", () => {
  withStorage({}, (data) => {
    writeAutoLockSeconds(0);
    assert.equal(data.get(AUTO_LOCK_KEY), "0");
    assert.equal(readAutoLockSeconds(), 0);
    writeAutoLockSeconds(30);
    assert.equal(readAutoLockSeconds(), 30);
  });
});

test("the countdown runs while the 账号 page is open and has a lock to go back to, on any section (D-077)", () => {
  const base = { seconds: 20, lockSet: false, unlocked: false, slideOn: true, slidOpen: true, fullWindow: true };
  assert.equal(autoLockRunning(base), true);
  assert.equal(autoLockRunning({ ...base, seconds: 0 }), false, "不上锁");
  assert.equal(autoLockRunning({ ...base, slidOpen: false }), false, "still frosted");
  assert.equal(autoLockRunning({ ...base, slideOn: false }), false, "no slide and no password: nothing to lock");
  assert.equal(autoLockRunning({ ...base, fullWindow: false }), false, "the mini window has no veil");
  const password = { ...base, lockSet: true, slideOn: false, slidOpen: false, fullWindow: false };
  assert.equal(autoLockRunning({ ...password, unlocked: true }), true, "password entered, mini window too");
  assert.equal(autoLockRunning({ ...password, unlocked: false }), false, "password screen showing");
});

test("the hint says what happens", () => {
  assert.match(autoLockHint(20, true), /20 秒/);
  assert.match(autoLockHint(0, true), /一直保持打开/);
  assert.match(autoLockHint(10, false), /先设账号页密码或打开滑动解锁/);
});
