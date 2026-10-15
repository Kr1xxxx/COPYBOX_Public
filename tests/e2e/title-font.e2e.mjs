import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

// The owner wants list titles such as 全部话术 / 最近使用 in 宋体 on both Windows and Mac (2026-10-15).
for (const platform of ["win32", "darwin"]) {
  test(`${platform}: the list title uses the 宋体 font list`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    const title = page.locator(".section-head h1");
    await expect(title).toHaveText("全部话术");
    const family = await title.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family).toContain("Songti SC");
    expect(family).toContain("SimSun");
    expect(family).not.toContain("Microsoft YaHei");
  });
}
