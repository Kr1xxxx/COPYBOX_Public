import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

test("Windows: the second section is plain-text 备注 and there is no empty title band", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  expect(await page.locator(".sidebar-top").evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(20);
  await page.getByRole("button", { name: "备注" }).first().click();
  await page.getByRole("button", { name: /新增/ }).first().click();
  const editor = page.locator(".inline-editor");
  await expect(editor).toContainText("备注内容");
  await expect(editor).not.toContainText("被什么引用");
  await expect(editor).not.toContainText("隐藏内容");
  await editor.locator("input").first().fill("公司地址");
  await editor.locator("textarea").first().fill("台北市信义区 123 号");
  await editor.locator(".editor-save").first().click();
  await page.locator(".native-row .row-main").first().click();
  await expect(page.locator(".native-row.selected")).toContainText("台北市信义区 123 号");
  await expect(page.locator(".native-reference")).toHaveCount(0);
});

test("macOS: the second section is still 秘密 with masking and references", async ({ page }) => {
  await asDesktop(page, "darwin");
  await seedSnippets(page);
  expect(await page.locator(".sidebar-top").evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(40);
  await page.getByRole("button", { name: "秘密" }).first().click();
  await page.getByRole("button", { name: /新增/ }).first().click();
  const editor = page.locator(".inline-editor");
  await expect(editor).toContainText("被什么引用");
  await expect(editor).toContainText("隐藏内容");
});

async function closeOptions(page, platform) {
  await asDesktop(page, platform);
  await seedSnippets(page);
  await page.getByRole("button", { name: /设置/ }).first().click();
  const group = page.getByRole("radiogroup", { name: "点击窗口关闭按钮时" });
  await group.scrollIntoViewIfNeeded();
  return group;
}

test("Windows: closing can shrink to the taskbar", async ({ page }) => {
  const group = await closeOptions(page, "win32");
  await expect(group.getByRole("radio")).toHaveText(["收到托盘", "缩到任务栏", "退出"]);
  await group.getByRole("radio", { name: "缩到任务栏" }).click();
  await expect(page.locator(".settings-row", { has: group })).toContainText("点任务栏上的图标就能再打开");
});

test("macOS: no taskbar option (the Dock icon already reopens the window)", async ({ page }) => {
  const group = await closeOptions(page, "darwin");
  await expect(group.getByRole("radio")).toHaveText(["收到托盘", "退出"]);
});
