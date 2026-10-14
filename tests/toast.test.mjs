// One toast, one timer: a newer message cancels the older one's timer, so it is never cut short.
import assert from "node:assert/strict";
import test from "node:test";
import { createToastController, DEFAULT_TOAST_MS, EMPTY_TOAST, TOAST_RESUME_MIN_MS, toastFadeMs, toastToneFor } from "../app/use-toast.ts";

function fakeClock() {
  let now = 0, nextId = 1;
  const pending = new Map();
  return {
    timers: {
      set: (callback, ms) => { const id = nextId++; pending.set(id, { at: now + ms, callback }); return id; },
      clear: (id) => { pending.delete(id); },
      now: () => now,
    },
    // Runs every timer that falls due, in order, including timers set by those callbacks.
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...pending].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = Math.max(now, due[1].at);
        pending.delete(due[0]);
        due[1].callback();
      }
      now = target;
    },
    get pending() { return pending.size; },
  };
}

function controller() {
  const clock = fakeClock();
  const states = [];
  const toast = createToastController((state) => states.push(state), clock.timers);
  return { clock, states, toast, current: () => states.at(-1) ?? EMPTY_TOAST };
}

test("a second message stays for its full time; the first one's timer does not clear it", () => {
  const { clock, toast, current } = controller();
  toast.show("条目已更新", { ms: 2200 });
  clock.advance(2000);
  toast.show("已复制，但使用记录保存失败", { ms: 2400 });
  clock.advance(1000); // the first timer would have fired here
  assert.equal(current().message, "已复制，但使用记录保存失败");
  clock.advance(1300);
  assert.equal(current().message, "已复制，但使用记录保存失败");
  clock.advance(100);
  assert.deepEqual(current(), EMPTY_TOAST);
  assert.equal(clock.pending, 0, "only one timer ever waits");
});

test("the default time is 2.2 s; ms 0 keeps the message until the next one", () => {
  const { clock, toast, current } = controller();
  toast.show("已导出");
  clock.advance(DEFAULT_TOAST_MS - 1);
  assert.equal(current().message, "已导出");
  clock.advance(1);
  assert.equal(current().message, "");
  toast.show("正在重新加载…", { ms: 0 });
  clock.advance(60_000);
  assert.equal(current().message, "正在重新加载…");
  assert.equal(clock.pending, 0);
});

test("clear and an empty message hide the toast and drop its timer", () => {
  const { clock, toast, current } = controller();
  toast.show("已刷新");
  toast.clear();
  assert.deepEqual(current(), EMPTY_TOAST);
  assert.equal(clock.pending, 0);
  toast.show("已刷新");
  toast.show("");
  assert.equal(current().message, "");
  assert.equal(clock.pending, 0);
  toast.show("已刷新");
  toast.dispose();
  assert.equal(clock.pending, 0, "unmounting stops the timer");
});

test("the tone is the one asked for, otherwise it follows the words", () => {
  const { toast, current } = controller();
  toast.show("目录已存在，已打开", { tone: "ok" });
  assert.equal(current().tone, "ok");
  toast.show("保存失败，目录保持原样", { tone: "error" });
  assert.equal(current().tone, "error");
  toast.show("删除失败，请重试");
  assert.equal(current().tone, "error", "parts that pass only text still get the error look");
  toast.show("已复制");
  assert.equal(current().tone, "ok");
});

test("error words are recognised; text the person typed inside 「」 does not count", () => {
  for (const message of ["复制失败，请重试", "无法打开数据文件夹", "图片太大，最多 10 MB", "只支持 PNG、JPG、WebP、GIF 图片", "目录名已存在", "目录名不能为空", "这张图片打不开", "存储空间满了，请清空回收站或删掉不用的内容", "存储空间快满了，请清空回收站或删掉不用的内容", "已添加 2 张，有 1 张没有添加：图片太大，最多 10 MB"]) {
    assert.equal(toastToneFor(message), "error", message);
  }
  for (const message of ["已复制", "图片已加密保存", "目录已创建", "已移到「失败案例」", "已删除目录「无法联系」", "验证码已复制", "已恢复"]) {
    assert.equal(toastToneFor(message), "ok", message);
  }
});

test("a toast stays fully visible, then fades during the last part of its time", () => {
  const { clock, toast, current } = controller();
  toast.show("条目已更新", { ms: 2200 });
  const fade = toastFadeMs(2200);
  assert.ok(fade >= 600 && fade <= 1200);
  assert.equal(current().fading, false);
  assert.equal(current().fadeMs, fade);
  clock.advance(2200 - fade - 1);
  assert.equal(current().fading, false, "still fully visible");
  clock.advance(1);
  assert.equal(current().fading, true, "the fade has started");
  assert.equal(current().message, "条目已更新");
  clock.advance(fade);
  assert.deepEqual(current(), EMPTY_TOAST);
  assert.equal(clock.pending, 0);
});

test("pause stops the time and brings it back to full; resume runs what was left", () => {
  const { clock, toast, current } = controller();
  toast.show("条目已加密保存", { ms: 5000 });
  clock.advance(1000);
  toast.pause();
  assert.equal(clock.pending, 0, "no timer while held");
  clock.advance(60_000);
  assert.equal(current().message, "条目已加密保存");
  assert.equal(current().fading, false);
  toast.resume();
  clock.advance(3999);
  assert.equal(current().message, "条目已加密保存", "the 4 s that were left");
  clock.advance(1);
  assert.deepEqual(current(), EMPTY_TOAST);
});

test("pausing while it fades makes it fully visible again; resume never ends sooner than the floor", () => {
  const { clock, toast, current } = controller();
  toast.show("已复制");
  clock.advance(DEFAULT_TOAST_MS - 100);
  assert.equal(current().fading, true);
  toast.pause();
  assert.equal(current().fading, false, "back to full strength at once");
  clock.advance(5000);
  toast.resume();
  assert.equal(current().fading, false);
  clock.advance(TOAST_RESUME_MIN_MS - 1);
  assert.equal(current().message, "已复制", "only 0.1 s was left, but it stays for the floor");
  clock.advance(1);
  assert.deepEqual(current(), EMPTY_TOAST);
});

test("pause and resume are idempotent and do nothing without a message", () => {
  const { clock, toast, current } = controller();
  toast.pause();
  toast.resume();
  toast.show("已导出", { ms: 2000 });
  toast.pause();
  toast.pause();
  clock.advance(500);
  toast.resume();
  toast.resume();
  assert.equal(clock.pending, 1, "one timer, not two");
  clock.advance(TOAST_RESUME_MIN_MS);
  assert.equal(current().message, "已导出");
  clock.advance(500);
  assert.equal(current().message, "", "it ended after the 2 s it still had");
});

test("a new message replaces a paused one and waits while the toast is still held", () => {
  const { clock, toast, current } = controller();
  const action = { label: "撤销", onClick: () => {} };
  toast.show("已移入回收站", { ms: 6000, actions: [action] });
  toast.pause();
  toast.show("已撤销", { ms: 1800 });
  assert.equal(current().message, "已撤销");
  assert.equal(current().actions, undefined, "the old buttons go with the old message");
  clock.advance(10_000);
  assert.equal(current().message, "已撤销", "still held");
  toast.resume();
  clock.advance(1799);
  assert.equal(current().message, "已撤销");
  clock.advance(1);
  assert.deepEqual(current(), EMPTY_TOAST);
});

test("clearing ends the hold, so the next message runs its time", () => {
  const { clock, toast, current } = controller();
  toast.show("条目已更新", { ms: 5000, actions: [{ label: "编辑", variant: "primary", onClick: () => {} }] });
  assert.equal(current().actions.length, 1);
  toast.pause();
  toast.clear(); // 编辑 was clicked: the toast goes while the pointer is still on it
  toast.show("已刷新", { ms: 1800 });
  clock.advance(1800);
  assert.deepEqual(current(), EMPTY_TOAST);
});

test("a message that stays (ms 0) is not timed by pause and resume", () => {
  const { clock, toast, current } = controller();
  toast.show("正在重新加载…", { ms: 0 });
  toast.pause();
  toast.resume();
  clock.advance(60_000);
  assert.equal(current().message, "正在重新加载…");
  assert.equal(clock.pending, 0);
});
