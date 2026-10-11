import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: 使用排行 counts a snippet once per minute and lists never-used ones`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    await page.locator(".native-row", { hasText: "非目标客户" }).locator(".row-main").click();
    const row = page.locator(".native-row.selected");
    await row.getByRole("button", { name: "复制", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__copied)).toBeTruthy();
    // A second copy right away is the same use.
    await row.getByRole("button", { name: "复制", exact: true }).click();
    await page.waitForTimeout(400);

    await page.getByRole("button", { name: /设置/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "设置" });
    await dialog.getByRole("tab", { name: "使用排行" }).click();
    await expect(dialog).toContainText("不记高亮块里填的内容");
    const top = dialog.locator('[data-usage="top"]');
    await expect(top.locator(".usage-row")).toHaveCount(1);
    await expect(top.locator(".usage-note")).toHaveText("1 次");
    await expect(dialog.locator('[data-usage="stale"]')).toContainText("暂时没有");
    const never = dialog.locator('[data-usage="never"]');
    await expect(never.locator("h4")).toContainText("33 条");
    await expect(never.locator(".usage-row")).toHaveCount(30);
    await expect(never).toContainText("还有 3 条没有列出");

    // Clicking an entry closes Settings and finds that snippet.
    await top.locator(".usage-row").click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".native-row")).toHaveCount(1);
    await expect(page.locator(".native-row")).toContainText("非目标客户");
  });
}
