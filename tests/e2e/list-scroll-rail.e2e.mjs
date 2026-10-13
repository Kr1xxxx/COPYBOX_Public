// The 话术 list: a shadow under the header once the list is scrolled, and a thin bar on the right that shows how much
// is above and below (owner: "拉到下面后，不知道上面还有多少"). The bar's thumb can be dragged; it hides when all fits.
import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

const FRAME = ".content-panel .list-frame:not(.vault-frame)";

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: the list shows a scroll bar and a header shadow once scrolled; dragging the thumb scrolls`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    const frame = page.locator(FRAME);
    const list = frame.locator("> .native-list");
    const rail = frame.locator("> .scroll-rail");
    const thumb = rail.locator(".scroll-rail-thumb");
    const depth = frame.locator("> .list-depth");

    // The frame keeps the list where it was: same width as the frame, bar overlaid (not taking width).
    const sizes = await frame.evaluate((el) => ({ frame: el.getBoundingClientRect().width, list: el.querySelector(".native-list").getBoundingClientRect().width }));
    expect(sizes.list).toBe(sizes.frame);
    await expect(rail).toHaveAttribute("aria-hidden", "true");

    // 34 snippets overflow the 680×620 window: bar shown, thumb at the top, no shadow yet.
    await expect(rail).toBeVisible();
    await expect(depth).toHaveCSS("opacity", "0");
    const top = async () => (await thumb.boundingBox()).y - (await rail.boundingBox()).y;
    expect(await top()).toBeLessThan(1);
    const thumbHeight = (await thumb.boundingBox()).height;
    const railHeight = (await rail.boundingBox()).height;
    expect(thumbHeight).toBeGreaterThanOrEqual(24);
    expect(thumbHeight).toBeLessThan(railHeight);

    // Scroll the list: the thumb moves down, the shadow appears.
    await list.evaluate((el) => { el.scrollTop = (el.scrollHeight - el.clientHeight) / 2; });
    await expect.poll(top).toBeGreaterThan(20);
    await expect(depth).toHaveCSS("opacity", "1");
    await list.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect.poll(async () => Math.round((await top()) + thumbHeight - railHeight)).toBeGreaterThanOrEqual(-1);

    // Back to the top, the shadow goes away again.
    await list.evaluate((el) => { el.scrollTop = 0; });
    await expect(depth).toHaveCSS("opacity", "0");

    // Drag the thumb halfway down the track: the list follows.
    const box = await thumb.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 10 + (railHeight - thumbHeight) / 2, { steps: 6 });
    await page.mouse.up();
    const progress = await list.evaluate((el) => el.scrollTop / (el.scrollHeight - el.clientHeight));
    expect(progress).toBeGreaterThan(0.4);
    expect(progress).toBeLessThan(0.6);

    // Clicking the track below the thumb pages down.
    const before = await list.evaluate((el) => el.scrollTop);
    const railBox = await rail.boundingBox();
    await page.mouse.click(railBox.x + railBox.width / 2, railBox.y + railBox.height - 3);
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(before + 100);
  });

  test(`${platform}: the bar hides when the whole list fits`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    const frame = page.locator(FRAME);
    await expect(frame.locator("> .scroll-rail")).toBeVisible();
    await page.getByRole("searchbox").or(page.locator("input[placeholder*='搜索']")).first().fill("退款");
    await expect.poll(() => frame.locator("> .native-list > .native-row").count()).toBeLessThan(5);
    await expect(frame.locator("> .scroll-rail")).toBeHidden();
    await expect(frame.locator("> .list-depth")).toHaveCSS("opacity", "0");
  });

  test(`${platform}: the 账号 list gets the same bar, without changing its size`, async ({ page }) => {
    await asDesktop(page, platform);
    await page.addInitScript(() => { if (!sessionStorage.getItem("__kept")) { localStorage.removeItem("clipbox.vault.samples.v2"); sessionStorage.setItem("__kept", "1"); } });
    await page.goto("/");
    await page.waitForSelector(".app-shell");
    await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
    const region = page.getByRole("region", { name: "保险箱" });
    await expect(region.locator(".vault-entry").first()).toBeVisible();
    const frame = page.locator(".list-frame.vault-frame");
    const boxes = await frame.evaluate((el) => { const a = el.getBoundingClientRect(); const b = el.querySelector(":scope > .vault-inline").getBoundingClientRect(); return [a.width - b.width, a.height - b.height]; });
    expect(boxes).toEqual([0, 0]);

    await expect(frame.locator("> .scroll-rail")).toBeHidden(); // the examples fit

    // Stand-in for a long account list (the window cannot get shorter than 620px): a tall block at the end.
    await region.evaluate((el) => { const block = document.createElement("div"); block.style.height = "900px"; el.append(block); });
    await expect(frame.locator("> .scroll-rail")).toBeVisible();
    await expect(frame.locator("> .list-depth")).toHaveCSS("opacity", "0");
    await region.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(frame.locator("> .list-depth")).toHaveCSS("opacity", "1");
  });
}
