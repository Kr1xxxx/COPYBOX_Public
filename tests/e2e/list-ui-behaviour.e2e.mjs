// Behaviour versions of two old source-text tests: "first run offers onboarding actions" (inline-ui) and
// "card and directory markers share the derived category color map" (category-colors).
import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

test("first run shows onboarding with its three actions, and 新增第一条 opens the editor", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.goto("/");
  const onboarding = page.locator(".native-empty.onboarding");
  await expect(onboarding).toBeVisible();
  for (const name of ["新增第一条", "导入话术表格", "导入备份"]) await expect(onboarding.getByRole("button", { name })).toBeVisible();
  await onboarding.getByRole("button", { name: "新增第一条" }).click();
  await expect(page.locator(".inline-editor, [role=dialog]").first()).toBeVisible();
});

test("an emptied folder or search shows the plain empty message, not onboarding", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await page.getByRole("searchbox").or(page.locator("input[placeholder*='搜索']")).first().fill("zzzz-no-such-text");
  await expect(page.locator(".native-empty")).toContainText("没有匹配的内容");
  await expect(page.locator(".native-empty.onboarding")).toHaveCount(0);
});

test("card dots and sidebar folder markers use the same colours; uncategorized cards use the grey", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  const colour = (locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor);
  const markers = page.locator(".directory-row .directory-color-marker:not(.hollow)");
  const markerCount = await markers.count();
  expect(markerCount).toBeGreaterThan(0);
  const markerColours = new Set();
  for (let i = 0; i < markerCount; i += 1) markerColours.add(await colour(markers.nth(i)));
  const dots = page.locator(".native-row .drag-handle .grip-pill");
  const dotCount = await dots.count();
  expect(dotCount).toBeGreaterThan(0);
  const GREY = "rgb(199, 199, 204)";
  let coloured = 0;
  for (let i = 0; i < dotCount; i += 1) {
    const dot = await dots.nth(i).evaluate((element) => getComputedStyle(element).color);
    if (dot !== GREY) { coloured += 1; expect(markerColours.has(dot)).toBe(true); }
  }
  expect(coloured).toBeGreaterThan(0);
});

test("the first-run panel settles part by part, and not at all with reduced motion (arc step 4)", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.goto("/");
  const parts = page.locator(".native-empty.onboarding > *");
  await expect(parts.first()).toBeVisible();
  const delays = await parts.evaluateAll((els) => els.map((el) => getComputedStyle(el).animationDelay));
  expect(delays[0]).toBe("0s");
  expect(delays.slice(1).every((delay, i) => parseFloat(delay) > parseFloat(delays[i]))).toBe(true); // each part a little later
  await expect(parts.last()).toHaveCSS("opacity", "1", { timeout: 3000 }); // and all of it ends fully visible

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator(".native-empty.onboarding")).toBeVisible();
  await expect(parts.last()).toHaveCSS("opacity", "1", { timeout: 500 });
});
