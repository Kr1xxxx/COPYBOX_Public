// Small frequent changes (copy counts, pins, order) are saved one second after the last change, or at once when
// the window is hidden or the app asks the page to save. Real edits still save immediately.
import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets, openRow } from "./helpers.mjs";

const vault = (page) => page.evaluate(() => localStorage.getItem("clipbox.vault.v1"));
const hideWindow = (page) => page.evaluate(() => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  document.dispatchEvent(new Event("visibilitychange"));
});

test.beforeEach(async ({ page }) => {
  await asDesktop(page, "win32");
  // the fake bridge gets the flush channel the real preload has
  await page.addInitScript(() => {
    window.__flushHandlers = [];
    window.__flushDone = 0;
    window.clipboxDesktop.onFlushRequest = (callback) => { window.__flushHandlers.push(callback); return () => {}; };
    window.clipboxDesktop.flushDone = () => { window.__flushDone += 1; };
  });
  await seedSnippets(page);
});

test("copying does not rewrite the vault right away; it is saved a second later", async ({ page }) => {
  const before = await vault(page);
  const row = page.locator(".native-row").nth(3);
  await row.locator(".native-copy").click();
  await expect(row.locator(".copy-status")).toHaveText("已复制");
  expect(await vault(page)).toBe(before);
  await expect.poll(() => vault(page), { timeout: 3000 }).not.toBe(before);
});

test("pinning is saved at once when the window is hidden, and survives a reload", async ({ page }) => {
  const before = await vault(page);
  await page.locator(".native-row").nth(2).locator(".native-pin").click();
  expect(await vault(page)).toBe(before);
  await hideWindow(page);
  await expect.poll(() => vault(page), { timeout: 1000 }).not.toBe(before);
  await page.reload();
  await page.waitForSelector(".native-row");
  await expect(page.locator(".native-row .native-pin[aria-pressed=true]")).toHaveCount(1);
});

test("when the desktop app asks the page to save before quitting, the pending change is on disk before the page answers", async ({ page }) => {
  const before = await vault(page);
  await page.locator(".native-row").nth(3).locator(".native-copy").click();
  expect(await vault(page)).toBe(before);
  await page.evaluate(() => { for (const handler of window.__flushHandlers) handler(); });
  await expect.poll(() => page.evaluate(() => window.__flushDone)).toBe(1);
  expect(await vault(page)).not.toBe(before);
});

test("an edit is saved immediately, not delayed", async ({ page }) => {
  const before = await vault(page);
  await openRow(page, page.locator(".native-row .row-main").nth(1));
  await page.locator(".native-row.selected").getByRole("button", { name: "编辑" }).click();
  const editor = page.locator(".inline-editor");
  await editor.locator("textarea").first().fill("改过的内容 lazy-save-check");
  await editor.getByRole("button", { name: /保存/ }).click();
  await expect.poll(() => vault(page), { timeout: 800 }).not.toBe(before);
});

test("quitting waits for an immediate save before acknowledging and the new entry survives reload", async ({ page }) => {
  await page.getByRole("button", { name: "新增条目", exact: true }).click();
  await page.getByLabel("标题", { exact: true }).fill("退出保存回归");
  await page.getByLabel("话术内容", { exact: true }).fill("Synthetic regression fixture.");
  const before = await vault(page);
  await page.evaluate(() => {
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    const gate = new Promise((resolve) => { window.__releaseSave = resolve; });
    crypto.subtle.encrypt = async (...args) => { window.__encryptStarted = true; await gate; return encrypt(...args); };
    window.clipboxDesktop.flushDone = () => { window.__flushDone += 1; window.__vaultAtAck = localStorage.getItem("clipbox.vault.v1"); };
  });
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__encryptStarted)).toBe(true);
  await page.evaluate(async () => {
    for (const handler of window.__flushHandlers) handler();
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
  expect(await page.evaluate(() => window.__flushDone)).toBe(0);
  expect(await vault(page)).toBe(before);
  await page.evaluate(() => window.__releaseSave());
  await expect.poll(() => page.evaluate(() => window.__flushDone)).toBe(1);
  expect(await page.evaluate(() => window.__vaultAtAck)).not.toBe(before);
  await page.reload();
  await expect(page.locator(".native-row")).toHaveCount(35);
  await expect(page.getByRole("button", { name: "展开 退出保存回归", exact: true })).toBeVisible();
});
