import assert from "node:assert/strict";
import test from "node:test";
import { createLazyWriter } from "../app/lazy-writer.ts";

function fakeClock() {
  let now = 0;
  const timers = new Map();
  let nextId = 1;
  return {
    setTimer: (callback, ms) => { const id = nextId++; timers.set(id, { at: now + ms, callback }); return id; },
    clearTimer: (id) => { timers.delete(id); },
    async advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

test("a burst of changes is saved once, one second after the last change", async () => {
  const clock = fakeClock();
  let saves = 0;
  const writer = createLazyWriter({ write: async () => { saves += 1; }, ...clock });
  writer.markDirty();
  await clock.advance(600);
  writer.markDirty();
  await clock.advance(600);
  assert.equal(saves, 0, "the second change restarted the countdown");
  await clock.advance(400);
  assert.equal(saves, 1);
  assert.equal(writer.hasPending(), false);
});

test("flush saves immediately and resolves only once the save finished", async () => {
  const clock = fakeClock();
  let finished = false;
  const writer = createLazyWriter({ write: () => new Promise((resolve) => setTimeout(() => { finished = true; resolve(); }, 20)), ...clock });
  writer.markDirty();
  await writer.flush();
  assert.equal(finished, true);
  await clock.advance(5000);
  assert.equal(finished, true);
});

test("flush with nothing pending does nothing; cancel drops a pending save", async () => {
  const clock = fakeClock();
  let saves = 0;
  const writer = createLazyWriter({ write: async () => { saves += 1; }, ...clock });
  await writer.flush();
  assert.equal(saves, 0);
  writer.markDirty();
  writer.cancel();
  await clock.advance(5000);
  assert.equal(saves, 0);
  assert.equal(writer.hasPending(), false);
});

test("a change made while a save is running is saved afterwards, never lost", async () => {
  const clock = fakeClock();
  const order = [];
  let release;
  const writer = createLazyWriter({
    write: () => { order.push("start"); return new Promise((resolve) => { release = () => { order.push("end"); resolve(); }; }); },
    ...clock,
  });
  writer.markDirty();
  const first = writer.flush();
  await new Promise((resolve) => setImmediate(resolve));
  writer.markDirty();
  const second = writer.flush();
  release();
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await second;
  assert.deepEqual(order, ["start", "end", "start", "end"]);
});

test("a failed save is reported and kept for the next flush", async () => {
  const clock = fakeClock();
  const errors = [];
  let fail = true;
  let saves = 0;
  const writer = createLazyWriter({ write: async () => { if (fail) throw new Error("disk full"); saves += 1; }, onError: (error) => errors.push(error.message), ...clock });
  writer.markDirty();
  await writer.flush();
  assert.deepEqual(errors, ["disk full"]);
  assert.equal(writer.hasPending(), true);
  fail = false;
  await writer.flush();
  assert.equal(saves, 1);
  assert.equal(writer.hasPending(), false);
});
