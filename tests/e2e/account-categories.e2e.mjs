import { expect, test } from "@playwright/test";
import { asDesktop, openAccountCategory, seedSnippets } from "./helpers.mjs";

// 账号 is sorted by 分类 only (owner, 2026-10-15): no 目录 list, no 未分类, no folder field, no 「移动到」, on the Mac too.
test("macOS: the 账号 page has 分类 and no 目录", async ({ page }) => {
  await asDesktop(page, "darwin");
  await seedSnippets(page);
  const sidebar = page.locator("aside.sidebar");
  await expect(sidebar.getByRole("button", { name: "新建目录" })).toBeVisible(); // 话术 still has its 目录
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await expect(page.getByRole("navigation", { name: "分类" }).getByRole("button")).toHaveText([/^登录/, /^收款信息/, /^API 密钥/, /^验证码/, /^恢复码/, /^其他/]);
  await expect(sidebar.locator(".nav-heading")).toHaveText(["分类"]);
  await expect(sidebar.getByRole("button", { name: "新建目录" })).toHaveCount(0);
  await expect(sidebar).not.toContainText("未分类");

  // An old-style entry in 其他: no 目录 field when adding it, no 「移动到」 in its menu.
  await openAccountCategory(page, "其他");
  await page.getByRole("button", { name: /新增/ }).first().click();
  const editor = page.locator(".inline-editor");
  await expect(editor).not.toContainText("目录");
  await editor.getByPlaceholder("例如 prod-ssh").fill("测试服务器");
  await editor.locator("textarea").first().fill("abc123");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const row = page.locator(".native-row", { hasText: "测试服务器" });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText("未分类");
  await row.locator(".row-main").first().click();
  await row.getByRole("button", { name: "更多操作 测试服务器" }).click();
  await expect(page.getByRole("menuitem").first()).toBeVisible();
  await expect(page.getByText("移动到")).toHaveCount(0);
  await page.keyboard.press("Escape");


  // Settings → 目录 lists only 话术目录 and 图片目录.
  await page.getByRole("button", { name: /设置/ }).first().click();
  const dialog = page.locator(".settings-dialog");
  await dialog.getByRole("tab", { name: "目录" }).click();
  await expect(dialog.locator(".settings-folder-group")).toHaveCount(2);
  await expect(dialog).not.toContainText("账号目录");
});
