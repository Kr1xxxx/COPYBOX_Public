import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

// The sidebar 目录 list shows four-character folder names (开场接待, 产品咨询) in full, also next to a three-digit
// count; only longer names end in "…" (owner, 2026-10-16: it used to show two characters).

const fits = (row) => row.locator(".nav-label").evaluate((label) => label.scrollWidth <= label.clientWidth);

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: four-character folder names show in full, longer ones end in …`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    const list = page.locator("aside.sidebar .directory-list");
    const row = list.locator(".directory-row", { hasText: "询盘接待" });
    await expect(row.locator(".nav-label")).toHaveText("询盘接待");
    // Worst case: a company library can put more than 99 snippets in one folder.
    await row.locator(".directory-main b").evaluate((count) => { count.textContent = "142"; });
    expect(await fits(row), "询盘接待 next to 142").toBe(true);

    await page.getByRole("button", { name: "新建目录" }).click();
    await page.getByRole("textbox", { name: "新目录名称" }).fill("开场接待新客户");
    await page.keyboard.press("Enter");
    const long = list.locator(".directory-row", { hasText: "开场接待新客户" });
    await expect(long).toBeVisible();
    expect(await fits(long), "a seven-character name is cut with …").toBe(false);
    await expect(long.locator(".nav-label")).toHaveCSS("text-overflow", "ellipsis");
  });
}
