// One toast, one timer: a newer message cancels the older one's timer, so it is never cut short.
import assert from "node:assert/strict";
import test from "node:test";
import { createToastController, DEFAULT_TOAST_MS, EMPTY_TOAST, toastToneFor } from "../app/use-toast.ts";

function fakeClock() {
  let now = 0, nextId = 1;
  const pending = new Map();
  return {
    timers: {
      set: (callback, ms) => { const id = nextId++; pending.set(id, { at: now + ms, callback }); return id; },
      clear: (id) => { pending.delete(id); },
    },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...pending].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at <= now && pending.has(id)) { pending.delete(id); timer.callback(); }
      }
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
