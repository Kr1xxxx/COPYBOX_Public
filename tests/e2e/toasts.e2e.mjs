// The message at the bottom: one at a time, a newer one keeps its full time (an older message's timer used to wipe it
// early), and failures show a red exclamation mark instead of the ✓.
import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets, openRow } from "./helpers.mjs";

// Notes, in page time, when each toast text appears and when the toast leaves the page.
async function recordToasts(page) {
  await page.addInitScript(() => {
    window.__toastLog = [];
    let last = "";
    const note = () => {
      const toast = document.querySelector(".toast");
      const line = toast?.querySelector(".toast-line:not([aria-hidden=true])")?.textContent ?? "";
      const text = toast ? line : "";
      if (text !== last) { last = text; window.__toastLog.push({ at: performance.now(), text }); }
    };
    new MutationObserver(note).observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-hidden"] });
  });
}

test("a second message stays its full time: the first message's timer does not cut it short", async ({ page }) => {
  await recordToasts(page);
  await asDesktop(page, "win32");
  await seedSnippets(page);
  const input = page.getByRole("textbox", { name: "新目录名称" });
  const toast = page.locator(".toast");

  await page.getByRole("button", { name: "新建目录" }).click();
  await input.fill("售后跟进");
  await input.press("Enter");
  await expect(toast).toContainText("目录已创建");
  await page.waitForTimeout(1500); // the first message (2.2 s) is well under way
  await page.getByRole("button", { name: "新建目录" }).click();
  await input.fill("售后跟进");
  await input.press("Enter");
  await expect(toast).toContainText("目录已存在，已打开");
  await expect(toast).toHaveCount(0, { timeout: 8000 });

  const log = await page.evaluate(() => window.__toastLog);
  const shown = log.findIndex((entry) => entry.text === "目录已存在，已打开");
  const gone = log.findIndex((entry, index) => index > shown && entry.text === "");
  expect(shown).toBeGreaterThanOrEqual(0);
  expect(gone).toBeGreaterThan(shown);
  // Its own time is 2.2 s; the old timer would have removed it about 0.7 s after it appeared.
  expect(log[gone].at - log[shown].at).toBeGreaterThan(2000);
  expect(log.slice(shown + 1, gone).every((entry) => entry.text === "目录已存在，已打开")).toBe(true);
});

test("an ok message draws the check; a failed 清空回收站 says so with the exclamation mark and keeps the trash", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  const toast = page.locator(".toast");

  // Move one snippet to the 回收站 (the 撤销 message uses the ok look).
  await openRow(page, page.locator(".row-main").first());
  await page.getByRole("button", { name: /^更多操作/ }).first().click();
  await page.locator(".row-menu").getByRole("menuitem", { name: "移到回收站" }).click();
  await expect(toast).toContainText("已移入回收站");
  await expect(toast).toHaveAttribute("data-tone", "ok");
  await expect(toast.locator(".toast-mark-ok")).toHaveCount(1);
  await expect(toast.locator(".toast-mark-error")).toHaveCount(0);

  await page.getByRole("button", { name: "设置" }).click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("tab", { name: "数据" }).click();
  await expect(settings).toContainText("永久删除 1 条，无法恢复");
  await settings.getByRole("button", { name: "清空…" }).click();
  // The disk refuses the write.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "clipbox.vault.v1") throw new Error("disk refused");
      return original.call(this, key, value);
    };
  });
  await settings.getByRole("button", { name: "确认清空" }).click();
  await expect(toast).toContainText("清空失败，回收站没有变化");
  await expect(toast).toHaveAttribute("data-tone", "error");
  await expect(toast).toHaveClass(/\berror\b/);
  await expect(toast.locator(".toast-mark-error")).toHaveCount(1);
  await expect(toast.locator(".toast-mark-ok")).toHaveCount(0);
  await expect(settings).toContainText("永久删除 1 条，无法恢复");
  const iconColour = await toast.locator(".toast-icon").evaluate((element) => getComputedStyle(element).color);
  const okColour = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ok").trim());
  expect(iconColour).not.toBe(okColour);
});

test("a spreadsheet that cannot be read is reported in the message, not in a browser alert", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  let alerted = false;
  page.on("dialog", (dialog) => { alerted = true; void dialog.dismiss(); });
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /导入话术表格/ }).first().click(),
  ]);
  await chooser.setFiles({ name: "别的表.csv", mimeType: "text/csv", buffer: Buffer.from("名字,电话\n张三,123\n", "utf8") });
  const toast = page.locator(".toast");
  await expect(toast).toContainText("缺少必需列");
  await expect(toast).toHaveAttribute("data-tone", "error");
  await expect(page.locator("[role=dialog]")).toHaveCount(0);
  expect(alerted).toBe(false);
});
