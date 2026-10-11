import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

for (const [platform, scheme] of [["darwin", "light"], ["darwin", "dark"], ["win32", "light"], ["win32", "dark"]]) {
  test(`mini window favourites bar copies on one click (${platform} ${scheme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 680, height: 620 }, locale: "zh-CN", colorScheme: scheme });
    const page = await context.newPage();
    await asDesktop(page, platform);
    await seedSnippets(page);

    // Copy a row twice so it earns a place in the bar, then go mini.
    await page.getByRole("button", { name: "迷你模式" }).click();
    await page.setViewportSize({ width: 360, height: 440 });
    await expect(page.locator(".mini-favorites")).toHaveCount(0);

    const row = page.locator(".mini-row .row-main").nth(2);
    await row.click(); await row.click();
    const chips = page.locator(".mini-chip");
    await expect(chips).toHaveCount(1);
    for (let i = 3; i < 7; i += 1) await page.locator(".mini-row .row-main").nth(i).click();
    await expect(chips).toHaveCount(5);

    await page.evaluate(() => { window.__copied = ""; });
    await chips.first().click();
    expect(await page.evaluate(() => window.__copied)).not.toBe("");
    await page.screenshot({ path: `test-results/mini-fav-${platform}-${scheme}.png` });

    await page.getByPlaceholder("搜索话术").fill("a");
    await expect(page.locator(".mini-favorites")).toHaveCount(0);
    await context.close();
  });
}
