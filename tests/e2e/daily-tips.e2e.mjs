import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

// The Tips card above 回收站 in the sidebar (app/daily-tips-card.tsx).
const card = (page) => page.locator(".sidebar .daily-tips");
const opener = (page) => page.locator(".sidebar .daily-tips-open");
const trashButton = (page) => page.locator(".sidebar .nav-footer").getByRole("button", { name: /^回收站/ });

async function expectAboveTrash(page) {
  await expect(card(page)).toBeVisible();
  await expect(card(page).locator(".daily-tips-label")).toHaveText("Tips");
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

  await opener(page).click();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".backup-head p")).toHaveText("Tips");
  await expect(dialog.getByRole("heading", { name: title })).toBeVisible();
  const text = (await dialog.locator(".tips-text").textContent()).trim();
  expect(text.length).toBeGreaterThan(0);
  await expect(opener(page)).toHaveAttribute("aria-expanded", "true");

  await dialog.getByRole("button", { name: "知道了" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener(page)).toBeFocused();
  await expect(opener(page)).toHaveAttribute("aria-expanded", "false");

  await opener(page).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener(page)).toBeFocused();
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
        localStorage.setItem("clipbox.tips.v1", JSON.stringify({ version: 1, extra: [], shownId: "T-001", shownDate: "2000-01-01", companyFirst: true }));
      }
    } catch { /* optional */ }
  });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("clipbox.tips.v1") || "{}").shownId)).toBe("T-002");
  await expect(page.locator(".daily-tips-title")).toHaveText("拼音也能搜");
});

async function seedTips(page, state) {
  await page.addInitScript((value) => {
    try {
      if (!sessionStorage.getItem("tips-seeded")) {
        sessionStorage.setItem("tips-seeded", "1");
        localStorage.setItem("clipbox.tips.v1", JSON.stringify(value));
      }
    } catch { /* optional */ }
  }, state);
}

test("someone in the middle of the usage tips sees the first company tip right away", async ({ page }) => {
  await seedTips(page, { version: 1, extra: [], shownId: "T-012", shownDate: "2000-01-01" });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await expect(page.locator(".daily-tips-title")).toHaveText("拿不准就叫 lovely");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("clipbox.tips.v1") || "{}"))).toMatchObject({ shownId: "C-001", companyFirst: true });
});

test("a company tip shows the right way as a highlight block, the wrong way struck through, and its source", async ({ page }) => {
  await seedTips(page, { version: 1, extra: [], shownId: "C-007", shownDate: "2000-01-01", companyFirst: true });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await expect(page.locator(".daily-tips-title")).toHaveText("结尾问一个好回答的问题");
  await opener(page).click();
  const dialog = page.getByRole("dialog", { name: "结尾问一个好回答的问题" });
  await expect(dialog.locator(".tips-text")).toContainText("867 个会话");
  await expect(dialog.locator(".tips-good")).toHaveText(["What curl & thickness do you usually use?"]);
  await expect(dialog.locator(".tips-bad s")).toHaveText(["If you have any needs, please feel free to contact me."]);
  await expect(dialog.locator(".tips-source")).toHaveText("来源: 根据 2026 年阿里对话数据");
  await expect(dialog).not.toContainText("✅");
  await expect(dialog).not.toContainText("❌");
  await page.setViewportSize({ width: 680, height: 620 });
  await page.screenshot({ path: test.info().outputPath("company-tip.png") });
});

test("the card shows the start of the tip ending in …, so it reads as something to open", async ({ page }) => {
  await seedTips(page, { version: 1, extra: [], shownId: "T-001", shownDate: "2000-01-01", companyFirst: true });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await expect(page.locator(".daily-tips-title")).toHaveText("拼音也能搜");
  const preview = page.locator(".daily-tips-preview");
  await expect(preview).toHaveText(/^搜索框可以直接打拼音.*…$/);
  // One line, cut with … where the card ends.
  const box = await preview.boundingBox();
  expect(box.height).toBeLessThan(20);
});

test("上一条 and 下一条 browse the tips, wrap at the ends, and do not change today's tip", async ({ page }) => {
  // T-001 on an earlier day: today's tip is T-002.
  await seedTips(page, { version: 1, extra: [], shownId: "T-001", shownDate: "2000-01-01", companyFirst: true });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  const title = page.locator(".daily-tips-title");
  const nav = card(page);
  await expect(title).toHaveText("拼音也能搜");
  await nav.getByRole("button", { name: "下一条" }).click();
  await expect(title).toHaveText("按编号找话术");
  await nav.getByRole("button", { name: "上一条" }).click();
  await nav.getByRole("button", { name: "上一条" }).click();
  await expect(title).toHaveText("一点就复制");

  // The browsed tip is the one that opens.
  await opener(page).click();
  await expect(page.getByRole("dialog", { name: "一点就复制" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Browsing is not saved: today's tip stays T-002, and a reload shows it again.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("clipbox.tips.v1") || "{}").shownId)).toBe("T-002");
  await page.reload();
  await page.waitForSelector(".app-shell");
  await expect(title).toHaveText("拼音也能搜");
});

test("上一条 from the first tip wraps to the last tip, 下一条 from there comes back", async ({ page }) => {
  // The last tip on an earlier day: today's tip is the first one, C-001.
  await seedTips(page, { version: 1, extra: [], shownId: "T-030", shownDate: "2000-01-01", companyFirst: true });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  const title = page.locator(".daily-tips-title");
  await expect(title).toHaveText("拿不准就叫 lovely");
  await card(page).getByRole("button", { name: "上一条" }).click();
  await expect(title).toHaveText("图片先压缩再存");
  await card(page).getByRole("button", { name: "下一条" }).click();
  await expect(title).toHaveText("拿不准就叫 lovely");
  await page.setViewportSize({ width: 680, height: 620 });
  await page.screenshot({ path: test.info().outputPath("tips-card.png") });
});

test("the Tips dialog has 上一条 / 下一条 too; they move the card along, and Tab stays inside the dialog", async ({ page }) => {
  // T-001 on an earlier day: today's tip is T-002.
  await seedTips(page, { version: 1, extra: [], shownId: "T-001", shownDate: "2000-01-01", companyFirst: true });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await opener(page).click();
  // One dialog; its name follows the tip on show.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("拼音也能搜");
  await expect(dialog.locator(".tips-text")).toContainText("搜索框可以直接打拼音");

  await dialog.getByRole("button", { name: "下一条" }).click();
  await expect(dialog).toHaveAccessibleName("按编号找话术");
  await expect(dialog.getByRole("heading", { name: "按编号找话术" })).toBeVisible();
  await expect(dialog.locator(".tips-text")).toContainText("#14");
  await dialog.getByRole("button", { name: "上一条" }).click();
  await dialog.getByRole("button", { name: "上一条" }).click();
  await expect(dialog).toHaveAccessibleName("一点就复制");

  // Tab goes 上一条 → 下一条 → 知道了 → 上一条, never out of the dialog.
  await dialog.getByRole("button", { name: "上一条" }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "下一条" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "知道了" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "上一条" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "知道了" })).toBeFocused();
  await page.setViewportSize({ width: 680, height: 620 });
  await page.screenshot({ path: test.info().outputPath("tips-dialog.png") });

  // Closing leaves the card on the tip that was open; today's tip is unchanged.
  await dialog.getByRole("button", { name: "知道了" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".daily-tips-title")).toHaveText("一点就复制");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("clipbox.tips.v1") || "{}").shownId)).toBe("T-002");
});
