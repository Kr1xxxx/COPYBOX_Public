import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

const STORE = "clipbox.web-backups.v1";
const backups = (page) => page.evaluate((key) => Object.keys(JSON.parse(localStorage.getItem(key) || "{}")), STORE);

async function openData(page) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await dialog.getByRole("tab", { name: "数据" }).click();
  return dialog;
}

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: a daily backup is saved by itself, and restoring asks first and brings the old content back`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    // Saved a few seconds after the data opens, once per day.
    await expect.poll(() => backups(page), { timeout: 20_000 }).toHaveLength(1);

    // New content after the backup.
    await page.getByRole("button", { name: /新增/ }).first().click();
    const editor = page.locator(".inline-editor");
    await editor.locator("input").first().fill("备份之后新加的话术");
    await editor.locator("textarea").first().fill("Added after the backup.");
    await editor.locator(".editor-save").first().click();
    await expect(page.locator(".native-row", { hasText: "备份之后新加的话术" })).toBeVisible();

    let s = await openData(page);
    await expect(s.getByText(/最近一份：\d+月\d+日/)).toBeVisible();
    await s.locator(".settings-row", { hasText: "从自动备份恢复" }).getByRole("button", { name: "选择…" }).click();
    const dialog = page.getByRole("dialog", { name: "从自动备份恢复" });
    await dialog.getByRole("button", { name: /\d+月\d+日/ }).click();
    // Nothing is replaced yet: it says what will be replaced, and cancelling keeps everything.
    await expect(dialog.getByRole("alert")).toContainText("替换现有的");
    await dialog.getByRole("button", { name: "返回" }).click();
    await dialog.getByRole("button", { name: "取消" }).click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".native-row", { hasText: "备份之后新加的话术" })).toBeVisible();

    s = await openData(page);
    await s.locator(".settings-row", { hasText: "从自动备份恢复" }).getByRole("button", { name: "选择…" }).click();
    const again = page.getByRole("dialog", { name: "从自动备份恢复" });
    await again.getByRole("button", { name: /\d+月\d+日/ }).click();
    await again.getByRole("button", { name: "确认替换" }).click();
    await page.waitForSelector(".native-row");
    await expect(page.locator(".native-row", { hasText: "备份之后新加的话术" })).toHaveCount(0);
    await expect(page.locator(".native-row")).toHaveCount(34);
  });
}

test("with the switch off no backup is made, and the 完整备份 rows carry their new names", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.addInitScript(() => { try { localStorage.setItem("clipbox.auto-backup.enabled", "off"); } catch { /* ignore */ } });
  await seedSnippets(page);
  await page.waitForTimeout(11_000);
  expect(await backups(page)).toHaveLength(0);
  const s = await openData(page);
  for (const text of ["完整备份", "从完整备份恢复", "每天自动备份", "从自动备份恢复"]) await expect(s.locator(".settings-row", { hasText: text }).first()).toBeVisible();
  await expect(s).not.toContainText("导出到新版");
  await expect(s).not.toContainText("从旧版导入");
  await expect(s.locator(".settings-row", { hasText: "从自动备份恢复" }).getByRole("button", { name: "选择…" })).toBeDisabled();
});
