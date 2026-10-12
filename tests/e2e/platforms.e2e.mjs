import { expect, test } from "@playwright/test";
import { asDesktop, openAccountCategory, seedSnippets } from "./helpers.mjs";

test("Windows: the sections are 话术, 账号 and 图片, and there is no empty title band", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  expect(await page.locator(".sidebar-top").evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(20);
  await expect(page.locator(".kind-switch button")).toHaveText(["话术", "账号", "图片"]);
  await page.getByRole("button", { name: "图片" }).first().click();
  await expect(page.getByRole("button", { name: "新增图片" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("备注");
  await expect(page.locator(".native-reference")).toHaveCount(0);
});

test("macOS: the second section is still 账号 with masking and references", async ({ page }) => {
  await asDesktop(page, "darwin");
  await seedSnippets(page);
  expect(await page.locator(".sidebar-top").evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(40);
  await page.getByRole("button", { name: "账号" }).first().click();
  await openAccountCategory(page, "其他");
  await page.getByRole("button", { name: /新增/ }).first().click();
  const editor = page.locator(".inline-editor");
  await expect(editor).toContainText("被什么引用");
  await expect(editor).toContainText("隐藏内容");
});

async function closeOptions(page, platform) {
  await asDesktop(page, platform);
  await seedSnippets(page);
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.getByRole("dialog", { name: "设置" }).getByRole("tab", { name: "窗口" }).click();
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

test("Windows: the empty 图片 page does not mention copy references", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await page.getByRole("button", { name: "图片" }).first().click();
  await expect(page.locator("body")).toContainText("把常发的图片存进来，一键复制。");
  await expect(page.locator("body")).not.toContainText("复制引用");
  await expect(page.locator("body")).not.toContainText("备注");
});

test("macOS: the empty 账号 page still says only the reference is copied", async ({ page }) => {
  await asDesktop(page, "darwin");
  await seedSnippets(page);
  await page.getByRole("button", { name: "账号" }).first().click();
  await openAccountCategory(page, "其他");
  await expect(page.locator("body")).toContainText("默认只复制引用");
});
