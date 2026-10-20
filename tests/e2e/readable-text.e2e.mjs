// D-103: no visible text under 12px, and the 数据 page shows one main backup with the rest folded under 更多.
import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

// Visible text nodes (outside drawings) whose font is smaller than 12px.
const smallText = (page) => page.evaluate(() => {
  const small = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!node.textContent.trim() || el.closest("svg, [aria-hidden=true], [class^=guide-]")) continue;
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height || box.bottom < 0 || box.top > innerHeight) continue;
    if (parseFloat(getComputedStyle(el).fontSize) < 12) small.push(`${el.className}: ${node.textContent.trim().slice(0, 20)}`);
  }
  return small;
});

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: list, open card and 设置 → 数据 have no text under 12px`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    await page.locator(".native-row").first().click();
    expect(await smallText(page)).toEqual([]);
    await page.getByRole("button", { name: /设置/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "设置" });
    await dialog.getByRole("tab", { name: "数据" }).click();
    await dialog.getByText("更多导出和导入").click();
    expect(await smallText(page)).toEqual([]);
  });
}

test("设置 → 数据: 完整备份 is the one main button; single-part exports wait under 更多", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await page.getByRole("button", { name: /设置/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await dialog.getByRole("tab", { name: "数据" }).click();
  await expect(dialog.locator(".settings-row", { hasText: "完整备份" }).first().locator(".primary-button")).toHaveText("导出…");
  await expect(dialog.locator(".primary-button:visible")).toHaveCount(1);
  await expect(dialog.getByText("导出话术备份")).toBeHidden();
  await dialog.getByText("更多导出和导入").click();
  await expect(dialog.getByText("导出话术备份")).toBeVisible();
  // Searching finds a folded row and shows it.
  await dialog.getByText("更多导出和导入").click();
  await dialog.getByPlaceholder("搜索设置").fill("账号表格");
  await expect(dialog.locator(".settings-row", { hasText: "导出账号表格" }).first()).toBeVisible();
});
