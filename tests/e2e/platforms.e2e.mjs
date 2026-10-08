import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

test("Windows：第二板块是纯文字“备注”，没有标题栏空白", async ({ page }) => {
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

test("macOS：第二板块仍是“秘密”，保留隐藏内容和引用", async ({ page }) => {
  await asDesktop(page, "darwin");
  await seedSnippets(page);
  expect(await page.locator(".sidebar-top").evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(40);
  await page.getByRole("button", { name: "秘密" }).first().click();
  await page.getByRole("button", { name: /新增/ }).first().click();
  const editor = page.locator(".inline-editor");
  await expect(editor).toContainText("被什么引用");
  await expect(editor).toContainText("隐藏内容");
});
