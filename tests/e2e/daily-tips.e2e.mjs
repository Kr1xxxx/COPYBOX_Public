import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

// The 每日 Tips card above 回收站 in the sidebar (app/daily-tips-card.tsx).
const card = (page) => page.locator(".sidebar .daily-tips");
const trashButton = (page) => page.locator(".sidebar .nav-footer").getByRole("button", { name: /^回收站/ });

async function expectAboveTrash(page) {
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText("每日 Tips");
  await expect(page.locator(".sidebar .daily-tips-title")).not.toHaveText("");
  await expect.poll(async () => {
    const [tip, trash] = await Promise.all([card(page).boundingBox(), trashButton(page).boundingBox()]);
    return tip && trash ? tip.y + tip.height <= trash.y : false;
  }).toBe(true);
}

test("the card sits above 回收站 in 话术, 账号 and 图片", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await expectAboveTrash(page);
  const kinds = page.locator(".kind-switch");
  await kinds.getByRole("button", { name: "账号" }).click();
  await expectAboveTrash(page);
  await kinds.getByRole("button", { name: "图片" }).click();
  await expect(page.locator(".image-section")).toBeVisible();
  await expectAboveTrash(page);
});

test("the mini window has no tips card", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await expect(card(page)).toBeVisible();
  await page.getByRole("button", { name: "迷你模式" }).click();
  await page.setViewportSize({ width: 360, height: 440 });
  await expect(page.locator(".app-shell.mini")).toBeVisible();
  await expect(page.locator(".daily-tips")).toHaveCount(0);
});

test("clicking the card shows the whole tip; 知道了 and Esc close it and focus returns to the card", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  const title = (await page.locator(".daily-tips-title").textContent()).trim();
  expect(title.length).toBeGreaterThan(0);

  await card(page).click();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("每日 Tips");
  await expect(dialog.getByRole("heading", { name: title })).toBeVisible();
  const text = (await dialog.locator(".tips-text").textContent()).trim();
  expect(text.length).toBeGreaterThan(0);
  await expect(card(page)).toHaveAttribute("aria-expanded", "true");

  await dialog.getByRole("button", { name: "知道了" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card(page)).toBeFocused();
  await expect(card(page)).toHaveAttribute("aria-expanded", "false");

  await card(page).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card(page)).toBeFocused();
});

test("the same day shows the same tip after a reload, and the choice is kept on the device", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  const title = page.locator(".daily-tips-title");
  await expect(title).not.toHaveText("");
  const first = await title.textContent();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("clipbox.tips.v1") || "null"));
  expect(stored).toMatchObject({ version: 1, shownId: expect.any(String), shownDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  await page.reload();
  await page.waitForSelector(".app-shell");
  await expect(title).toHaveText(first);
});

test("a new day moves to the next tip", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem("tips-seeded")) {
        sessionStorage.setItem("tips-seeded", "1");
        localStorage.setItem("clipbox.tips.v1", JSON.stringify({ version: 1, extra: [], shownId: "T-001", shownDate: "2000-01-01" }));
      }
    } catch { /* optional */ }
  });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("clipbox.tips.v1") || "{}").shownId)).toBe("T-002");
  await expect(page.locator(".daily-tips-title")).toHaveText("拼音也能搜");
});
