// Saving when storage is full or nearly full, and restoring a backup while a delayed save is still under way.
import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets, openRow } from "./helpers.mjs";

const FULL = "存储空间满了，请清空回收站或删掉不用的内容";
const NEARLY_FULL = "存储空间快满了，请清空回收站或删掉不用的内容";

// From now on the browser refuses to store the vault, as it does when localStorage is full.
const fillStorage = (page) => page.evaluate(() => {
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key === "clipbox.vault.v1") throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    return setItem.call(this, key, value);
  };
});

async function openSettings(page) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await dialog.getByRole("tab", { name: "数据" }).click();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
});

test("saving an edit when storage is full says so plainly instead of asking to retry", async ({ page }) => {
  await fillStorage(page);
  await openRow(page, page.locator(".native-row .row-main").nth(1));
  await page.locator(".native-row.selected").getByRole("button", { name: "编辑" }).click();
  const editor = page.locator(".inline-editor");
  await editor.locator("textarea").first().fill("改过的内容 storage-full-check");
  await editor.getByRole("button", { name: /保存/ }).click();
  await expect(editor.getByRole("alert")).toHaveText(FULL);
  await expect(editor.locator("textarea").first()).toHaveValue("改过的内容 storage-full-check");
});

test("a delayed save (copy count) that hits full storage says so too", async ({ page }) => {
  await fillStorage(page);
  await page.locator(".native-row").nth(3).locator(".native-copy").click();
  await expect(page.getByText(FULL)).toBeVisible({ timeout: 4000 });
  await expect(page.getByText("最近的改动保存失败")).toHaveCount(0);
});

test("when storage is nearly full, a save warns once", async ({ page }) => {
  // Other data fills about 87% of the ~5 million characters a page may keep.
  await page.evaluate(() => localStorage.setItem("clipbox.test-filler", "x".repeat(4_350_000)));
  // A new entry: its own 「条目已加密保存」 must not hide the warning.
  await page.getByRole("button", { name: "新增条目", exact: true }).click();
  await page.getByLabel("标题", { exact: true }).fill("快满提醒");
  await page.getByLabel("话术内容", { exact: true }).fill("Synthetic nearly-full check.");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText(NEARLY_FULL)).toBeVisible();
  await expect(page.getByText(NEARLY_FULL)).toHaveCount(0, { timeout: 6000 });
  // Further saves in the same session do not repeat it.
  for (const n of [1, 2]) {
    await openRow(page, page.locator(".native-row .row-main").nth(n));
    await page.locator(".native-row.selected").getByRole("button", { name: "编辑" }).click();
    const editor = page.locator(".inline-editor");
    await editor.locator("textarea").first().fill(`改过的内容 nearly-full-${n}`);
    await editor.getByRole("button", { name: /保存/ }).click();
    await expect(editor).toHaveCount(0);
  }
  await page.waitForTimeout(500);
  await expect(page.getByText(NEARLY_FULL)).toHaveCount(0);
});

test("restoring a full backup right after a copy keeps the restored data: the delayed save cannot land on top of it", async ({ page }) => {
  // A full backup with the 34 sample snippets.
  const settings = await openSettings(page);
  await settings.locator(".settings-row", { hasText: "完整备份" }).getByRole("button", { name: "导出…" }).click();
  const exportDialog = page.getByRole("dialog", { name: "完整备份" });
  await exportDialog.getByPlaceholder("至少 8 个字符").fill("restore-1234");
  await exportDialog.getByPlaceholder("确认密码").fill("restore-1234");
  const [download] = await Promise.all([page.waitForEvent("download"), exportDialog.getByRole("button", { name: "加密并导出" }).click()]);
  const file = await download.path();
  await exportDialog.getByRole("button", { name: "完成" }).click();
  await settings.getByRole("button", { name: "关闭设置" }).click();

  // Something the backup does not have.
  await page.getByRole("button", { name: "新增条目", exact: true }).click();
  await page.getByLabel("标题", { exact: true }).fill("恢复前新增");
  await page.getByLabel("话术内容", { exact: true }).fill("Synthetic restore check.");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".native-row")).toHaveCount(35);

  // The next vault encryption waits until it is let go: the delayed save of the copy count is then still under way
  // when the restore begins. It is let go as soon as the restore has written the vault (the moment it would do harm),
  // or after 800 ms if the restore waits for it first.
  await page.evaluate(() => {
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    window.__releaseSave = () => release();
    crypto.subtle.encrypt = async (...args) => {
      if (!window.__held) { window.__held = true; await held; }
      return encrypt(...args);
    };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      setItem.call(this, key, value);
      if (window.__restoring && key === "clipbox.vault.v1") window.__releaseSave();
    };
  });
  const added = page.locator(".native-row", { hasText: "恢复前新增" });
  await added.locator(".native-copy").click();
  await expect(added.locator(".copy-status")).toHaveText("已复制");
  await expect.poll(() => page.evaluate(() => window.__held === true), { timeout: 4000 }).toBe(true);

  const again = await openSettings(page);
  await again.locator(".settings-row", { hasText: "从完整备份恢复" }).getByRole("button").click();
  const restore = page.getByRole("dialog", { name: "从完整备份恢复" });
  await restore.getByLabel("备份文件").setInputFiles(file);
  await restore.getByPlaceholder("输入导出时设置的密码").fill("restore-1234");
  await restore.getByRole("button", { name: "验证并替换" }).click();
  await expect(restore.getByRole("alert")).toContainText("替换现有的 35 条内容");
  await page.evaluate(() => { window.__restoring = true; setTimeout(() => window.__releaseSave(), 800); });
  await restore.getByRole("button", { name: "确认替换" }).click();

  // The page reloads by itself after the restore.
  await page.waitForFunction(() => !window.__restoring, null, { timeout: 15_000 });
  await expect(page.locator(".native-row")).toHaveCount(34);
  await expect(page.getByText("恢复前新增")).toHaveCount(0);
  await expect(page.getByText("本地数据读取失败")).toHaveCount(0);
  // What is on disk, not only what was in memory.
  await page.reload();
  await expect(page.locator(".native-row")).toHaveCount(34);
  await expect(page.getByText("恢复前新增")).toHaveCount(0);
});
