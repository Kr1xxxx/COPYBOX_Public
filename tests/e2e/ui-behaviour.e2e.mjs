// Behaviour versions of the old source-text tests (backup-ui, snippet-number-ui, copy-button-ui, card-marker-ui,
// editor-typography, product-filter-ui). They look at what a person sees and what the browser computes,
// not at the wording of the source files.
import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

async function openSettings(page) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  return page.getByRole("dialog", { name: "设置" });
}

test.describe("snippet list", () => {
  test.beforeEach(async ({ page }) => { await asDesktop(page, "win32"); await seedSnippets(page); });

  test("a snippet number shows only in the opened entry and in its editor; no summaries in the list", async ({ page }) => {
    await expect(page.locator(".snippet-summary")).toHaveCount(0);
    await expect(page.locator(".native-list")).not.toContainText("未填写中文总结");
    await expect(page.locator(".native-row")).not.toHaveCount(1);
    // the number belongs to the opened entry only: there is never more than one on the page
    await expect(page.locator(".native-row:not(.selected) .row-snippet-number")).toHaveCount(0);

    await page.locator(".native-row .row-main").nth(2).click();
    const selected = page.locator(".native-row.selected");
    await expect(selected.locator(".row-snippet-number")).toHaveCount(1);
    await expect(selected.locator(".row-snippet-number")).toHaveText(/\S+/);
    await expect(page.locator(".row-snippet-number")).toHaveCount(1);

    await selected.getByRole("button", { name: "编辑" }).click();
    await expect(page.locator(".inline-editor .editor-snippet-number")).toHaveText(/\S+/);
  });

  test("copying shows an announced 已复制 state on a compact green button, and the opened entry has a labelled copy action", async ({ page }) => {
    // a 话术 without variables copies at once; one with variables asks for them first (see main-flows)
    const plain = page.locator(".native-row:not(.selected):not(:has(.snippet-variable))");
    const row = plain.first();
    const button = row.locator(".native-copy");
    const box = await button.boundingBox();
    expect(Math.round(box.width)).toBe(28);
    expect(Math.round(box.height)).toBe(28);
    await expect(button).toHaveAttribute("aria-label", /^复制 /);

    await button.click();
    const status = row.locator(".copy-status");
    await expect(status).toHaveText("已复制");
    await expect(status).toHaveAttribute("role", "status");
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(button).toHaveAttribute("aria-label", /^已复制 /);
    await expect(row).toHaveClass(/copied/);
    expect(await button.evaluate((element) => getComputedStyle(element).color)).toBe("rgb(47, 155, 98)");
    await expect(page.locator(".copy-feedback")).toHaveCount(0);

    await page.keyboard.press("Tab");
    await button.focus();
    expect(await button.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");

    await plain.nth(3).locator(".row-main").click();
    const primary = page.locator(".native-row.selected").locator(".primary-button.copy-main").first();
    await expect(primary).toBeVisible();
    const before = await primary.boundingBox();
    await primary.click();
    await expect(primary).toHaveAttribute("data-copied", "");
    await expect(primary).toHaveAccessibleName("已复制");
    // the button keeps its size once the copy worked
    const after = await primary.boundingBox();
    expect(after.width).toBeCloseTo(before.width, 0);
    expect(after.height).toBeCloseTo(before.height, 0);
  });

  test("the card marker is a small round drag handle that can be focused", async ({ page }) => {
    const marker = page.locator(".native-row .drag-handle i").first();
    const style = await marker.evaluate((element) => { const computed = getComputedStyle(element); return { width: computed.width, height: computed.height, radius: computed.borderRadius }; });
    expect(style).toEqual({ width: "8px", height: "8px", radius: "50%" });
    const handle = page.locator(".native-row .drag-handle").first();
    await page.keyboard.press("Tab");
    await handle.focus();
    expect(await handle.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  });

  test("the product filter menu opens above the card list and its entries can be clicked", async ({ page }) => {
    await page.locator(".product-filter").click();
    const menu = page.locator(".product-filter-menu");
    await expect(menu).toBeVisible();
    const item = menu.getByRole("menuitem").nth(1);
    const topmost = await item.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return element === hit || element.contains(hit);
    });
    expect(topmost).toBe(true);
    const name = await item.innerText();
    await item.click();
    await expect(page.locator(".product-filter")).toContainText(name);
  });

  test("editor text areas use the same readable weight as editor inputs", async ({ page }) => {
    await page.getByRole("button", { name: /新增/ }).first().click();
    const weight = (selector) => page.locator(selector).first().evaluate((element) => getComputedStyle(element).fontWeight);
    const input = await weight(".inline-editor .soft-input input");
    expect(Number(input)).toBeGreaterThanOrEqual(500);
    expect(await weight(".inline-editor .soft-textarea textarea")).toBe(input);
  });
});

test("snippets and 秘密 are exported to separate files, never one combined backup", async ({ page }) => {
  await asDesktop(page, "darwin");
  await seedSnippets(page);
  const settings = await openSettings(page);
  await expect(settings.locator(".settings-row", { hasText: "导出话术备份" })).toBeVisible();
  await expect(settings.locator(".settings-row", { hasText: "导出秘密备份" })).toBeVisible();
  await expect(settings).not.toContainText("导出安全备份");
  await expect(settings).not.toContainText("导出全部");

  await settings.locator(".settings-row", { hasText: "导出话术备份" }).getByRole("button", { name: "导出…" }).click();
  const dialog = page.getByRole("dialog", { name: /导出话术备份/ });
  await dialog.getByPlaceholder("至少 8 个字符").fill("snippets-backup-1");
  await dialog.getByPlaceholder("确认备份密码").fill("snippets-backup-1");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "加密并导出" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^clipbox-snippets-\d{4}-\d{2}-\d{2}\.json$/);
  const { readFileSync } = await import("node:fs");
  expect(JSON.parse(readFileSync(await download.path(), "utf8"))).toMatchObject({ format: "clipbox-secure-backup", version: 3, scope: "snippet" });
});
