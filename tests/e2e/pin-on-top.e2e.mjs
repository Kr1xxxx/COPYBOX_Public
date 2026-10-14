import { test, expect } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

const pinCalls = (page) => page.evaluate(() => window.__pinCalls ?? []);

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: 固定在最上层 sits left of 迷你模式, tells the shell, and is remembered after a reload`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    const toolbar = page.locator(".content-panel .toolbar");
    const pin = toolbar.getByRole("button", { name: "固定在最上层" });
    const mini = toolbar.getByRole("button", { name: "迷你模式" });
    await expect(pin).toHaveAttribute("aria-pressed", "false");
    await expect(pin).toHaveAttribute("title", "固定在最上层");
    expect(await pinCalls(page)).toEqual([false]);

    // Directly left of 迷你模式, on the same line, inside the toolbar.
    const pinBox = await pin.boundingBox();
    const miniBox = await mini.boundingBox();
    const barBox = await toolbar.boundingBox();
    expect(pinBox.x + pinBox.width).toBeLessThanOrEqual(miniBox.x + 1);
    expect(miniBox.x - (pinBox.x + pinBox.width)).toBeLessThan(16);
    expect(Math.abs(pinBox.y + pinBox.height / 2 - (miniBox.y + miniBox.height / 2))).toBeLessThan(2);
    expect(miniBox.x + miniBox.width).toBeLessThanOrEqual(barBox.x + barBox.width + 1);
    expect(await toolbar.evaluate((el) => [...el.children].findIndex((child) => child.getAttribute("aria-label") === "迷你模式")
      - [...el.children].findIndex((child) => child.classList.contains("pin-on-top")))).toBe(1);

    await pin.click();
    const unpin = toolbar.getByRole("button", { name: "取消固定" });
    await expect(unpin).toHaveAttribute("aria-pressed", "true");
    await expect(unpin).toHaveAttribute("title", "取消固定");
    await expect(unpin).toHaveClass(/active/);
    expect(await pinCalls(page)).toEqual([false, true]);
    expect(await page.evaluate(() => localStorage.getItem("clipbox.pin-on-top"))).toBe("1");
    // The on state uses the accent colour, the off state does not.
    const accent = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--accent)";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    await page.mouse.move(0, 0);
    await expect(unpin).toHaveCSS("color", accent);

    await page.reload();
    await page.waitForSelector(".native-row");
    const restored = page.locator(".content-panel .toolbar").getByRole("button", { name: "取消固定" });
    await expect(restored).toHaveAttribute("aria-pressed", "true");
    expect(await pinCalls(page)).toEqual([true]);

    await restored.click();
    await expect(page.locator(".content-panel .toolbar").getByRole("button", { name: "固定在最上层" })).toHaveAttribute("aria-pressed", "false");
    expect(await pinCalls(page)).toEqual([true, false]);
    expect(await page.evaluate(() => localStorage.getItem("clipbox.pin-on-top"))).toBeNull();
  });
}

test("a plain browser tab gets no pin button (it could not keep the window on top)", async ({ page }) => {
  await seedSnippets(page);
  await expect(page.getByRole("button", { name: "迷你模式" }).first()).toBeVisible();
  await expect(page.locator(".pin-on-top")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "固定在最上层" })).toHaveCount(0);
});
