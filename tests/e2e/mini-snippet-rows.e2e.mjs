// Mini window 话术 rows (owner's request, 2026-10-13): a click opens the row in place with only 「修改」; a floating
// 「复制」 button on hover copies without opening it. Folder tabs show two-character names.
import { test, expect } from "@playwright/test";
import { asDesktop, openAccountCategory, seedSnippets } from "./helpers.mjs";

async function openMini(page, platform = "win32") {
  await asDesktop(page, platform);
  await seedSnippets(page);
  await page.getByRole("button", { name: "迷你模式" }).click();
  await page.setViewportSize({ width: 360, height: 440 });
  await expect(page.locator(".mini-row").first()).toBeVisible();
  await page.waitForTimeout(400);
}

const rows = (page) => page.locator(".mini-list > .mini-row");

test("mini: a click on a 话术 row opens it with the whole text and only 修改; a second click closes it", async ({ page }) => {
  await openMini(page);
  const row = rows(page).nth(1);
  const label = (await row.locator(".snippet-label").textContent()).trim();
  await row.locator(".row-main").click();
  await expect(row).toHaveClass(/\bopen\b/);
  await expect(row.locator(".row-main")).toHaveAttribute("aria-expanded", "true");
  await expect(page.evaluate(() => window.__copied)).resolves.toBeUndefined();
  const detail = row.locator(".mini-detail");
  await expect(detail.locator(".row-content")).toBeVisible();
  // The whole text wraps instead of ending in one clipped line.
  expect(await detail.locator(".row-content").evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("pre-wrap");
  await expect(detail.getByRole("button")).toHaveText(["修改"]);
  for (const name of [/英文|中文/, /AI/, /更多操作/, /回收站/, /收藏/]) await expect(row.getByRole("button", { name })).toHaveCount(0);
  await expect(row.locator("input, textarea")).toHaveCount(0);
  await row.locator(".row-main").click();
  await expect(row).not.toHaveClass(/\bopen\b/);
  await expect(row.locator(".mini-detail")).toHaveCount(0);
  await expect(page.getByRole("button", { name: `展开 ${label}` })).toBeVisible();
});

test("mini: opening another 话术 row closes the first", async ({ page }) => {
  await openMini(page);
  await rows(page).nth(0).locator(".row-main").click();
  await expect(rows(page).nth(0)).toHaveClass(/\bopen\b/);
  await rows(page).nth(2).locator(".row-main").click();
  await expect(rows(page).nth(2)).toHaveClass(/\bopen\b/);
  await expect(rows(page).nth(0)).not.toHaveClass(/\bopen\b/);
  await expect(page.locator(".mini-row.open")).toHaveCount(1);
  await expect(rows(page).nth(0).locator(".mini-detail")).toHaveCount(0);
});

test("mini: 修改 opens the editor for that 话术 and saving keeps the mini window", async ({ page }) => {
  await openMini(page);
  const row = rows(page).nth(1);
  const label = (await row.locator(".snippet-label").textContent()).trim();
  await row.locator(".row-main").click();
  await row.getByRole("button", { name: `修改 ${label}` }).click();
  const editor = page.getByRole("group", { name: `编辑 ${label}` });
  await expect(editor).toBeVisible();
  const box = await editor.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  const title = editor.locator("input").first();
  await expect(title).toHaveValue(label);
  await title.fill(`${label} 改`);
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator(".app-shell.mini")).toBeVisible();
  await expect(page.locator(".mini-list .snippet-label", { hasText: `${label} 改` })).toBeVisible();
});

test("mini: hovering a 话术 row shows 复制; it copies the text without opening the row and says 已复制", async ({ page }) => {
  await openMini(page);
  const row = rows(page).nth(1);
  const label = (await row.locator(".snippet-label").textContent()).trim();
  const copyButton = row.locator(".mini-copy");
  await expect(copyButton).toHaveCSS("opacity", "0");
  const rowBox = await row.boundingBox();
  await row.hover();
  await expect(copyButton).toHaveCSS("opacity", "1");
  // Floats over the row: the row keeps its height.
  expect((await row.boundingBox()).height).toBeCloseTo(rowBox.height, 0);
  await page.getByRole("button", { name: `复制 ${label}` }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBeTruthy();
  const copied = await page.evaluate(() => window.__copied);
  // Mini copies the row's text; highlighted blocks go out filled (see the test below), never with brackets.
  expect(copied.length).toBeGreaterThan(10);
  await expect(row).not.toHaveClass(/\bopen\b/);
  await expect(row.locator(".mini-detail")).toHaveCount(0);
  await expect(copyButton).toHaveAttribute("data-copied", "");
  await expect(copyButton).toHaveAccessibleName(`已复制 ${label}`);
  await expect(copyButton).toContainText("已复制");
  await expect(row.getByRole("status")).toHaveText("已复制");
  await expect(row).toHaveClass(/\bcopied\b/);
  // It settles back after about a second.
  await expect(copyButton).not.toHaveAttribute("data-copied", "", { timeout: 3000 });
  await expect(row).not.toHaveClass(/\bcopied\b/);
});

test("mini: the copied text is the row's text and the copy is counted under 最近", async ({ page }) => {
  await openMini(page);
  const row = rows(page).nth(3);
  const label = (await row.locator(".snippet-label").textContent()).trim();
  await row.locator(".row-main").click();
  const text = await row.locator(".row-content").innerText();
  await row.hover();
  await page.getByRole("button", { name: `复制 ${label}` }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBeTruthy();
  const copied = await page.evaluate(() => window.__copied);
  expect(copied).not.toMatch(/\[[^\]]+\]/);
  // Text outside the highlighted blocks is copied as shown.
  expect(copied.replace(/\s/g, "").slice(0, 6)).toBe(text.replace(/\s/g, "").slice(0, 6));
  await page.locator(".mini-top .mini-tab", { hasText: "最近" }).click();
  await expect(page.locator(".mini-list .snippet-label").first()).toHaveText(label);
});

test("mini: the row and its 复制 button are both reached with Tab", async ({ page }) => {
  await openMini(page);
  const row = rows(page).nth(0);
  const label = (await row.locator(".snippet-label").textContent()).trim();
  await row.locator(".row-main").focus();
  await expect(row.locator(".row-main")).toBeFocused();
  await page.keyboard.press("Tab");
  const copyButton = row.locator(".mini-copy");
  await expect(copyButton).toBeFocused();
  await expect(copyButton).toHaveCSS("opacity", "1");
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__copied)).toBeTruthy();
  await expect(row).not.toHaveClass(/\bopen\b/);
  await expect(copyButton).toHaveAccessibleName(`已复制 ${label}`);
});

test("mini: with reduced motion the copy button changes state without the pop", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openMini(page);
  const row = rows(page).nth(1);
  await row.hover();
  await row.locator(".mini-copy").click();
  await expect(row.locator(".mini-copy")).toHaveAttribute("data-copied", "");
  expect(await row.locator(".mini-copy").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});

test("mini: folder tabs show two-character names with the full name as the tooltip", async ({ page }) => {
  await openMini(page);
  const tabs = page.locator(".mini-folders .mini-tab");
  await expect(tabs).toHaveText(["询盘", "产品", "报价", "定制", "跟进", "物流", "售后"]);
  await expect(tabs.first()).toHaveAttribute("title", "询盘接待");
  await expect(page.getByRole("button", { name: "物流清关" })).toHaveText("物流");
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveClass(/\bactive\b/);
  await expect(page.locator(".mini-list .mini-row").first()).toBeVisible();
});

test("macOS mini: an old 账号 row still copies on click and does not open", async ({ page }) => {
  await asDesktop(page, "darwin");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await openAccountCategory(page, "其他");
  await page.getByRole("button", { name: "新增条目", exact: true }).click();
  await page.getByPlaceholder("例如 prod-ssh").fill("测试服务器");
  await page.getByPlaceholder("输入要保存的密码或文本").fill("secret-value-123");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".native-row", { hasText: "测试服务器" })).toBeVisible();
  await page.getByRole("button", { name: "迷你模式" }).click();
  await page.setViewportSize({ width: 360, height: 440 });
  const row = page.locator(".mini-row", { hasText: "测试服务器" });
  await expect(row).toBeVisible();
  await expect(row.locator(".mini-copy")).toHaveCount(0);
  await row.locator(".row-main").click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("secret-value-123");
  await expect(row.locator(".mini-detail")).toHaveCount(0);
  await expect(row.locator(".mini-copied")).toHaveText("已复制");
});

test("mini: unfilled highlighted blocks go out as their default (Name → Friend), never as [Name], and a message says so", async ({ page }) => {
  await openMini(page);
  const row = page.locator(".mini-list > .mini-row", { hasText: "thanks for reaching out" }).first();
  const label = (await row.locator(".snippet-label").textContent()).trim();
  await row.hover();
  await page.getByRole("button", { name: `复制 ${label}` }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("Hi Friend, thanks for reaching out to Company! How can I help you today?");
  await expect(page.getByText("已复制，2 处没填，用了默认值")).toBeVisible();
});

test("mini: a block uses its pinned value, but never what was typed in the main window for the last customer", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("clipbox.pinned-values.v1", JSON.stringify({ Company: ["Comely"] })));
  await asDesktop(page, "win32");
  await seedSnippets(page);
  // Main window: this customer is Amanda.
  await page.locator(".native-row", { hasText: "自我介绍" }).locator(".row-main").click();
  const open = page.locator(".native-row.selected");
  await open.locator("input[data-var=Name]").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Amanda");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Acme");
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("Hi Amanda, thanks for reaching out to Acme! How can I help you today?");
  // Mini window, next customer: Name goes out as Friend, Company as the pinned Comely, not as Amanda / Acme.
  await page.getByRole("button", { name: "迷你模式" }).click();
  await page.setViewportSize({ width: 360, height: 440 });
  const row = page.locator(".mini-list > .mini-row", { hasText: "thanks for reaching out" }).first();
  await expect(row).toBeVisible();
  const label = (await row.locator(".snippet-label").textContent()).trim();
  await row.hover();
  await page.getByRole("button", { name: `复制 ${label}` }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("Hi Friend, thanks for reaching out to Comely! How can I help you today?");
  await expect(page.getByText("已复制，2 处没填，用了默认值")).toBeVisible();
});
