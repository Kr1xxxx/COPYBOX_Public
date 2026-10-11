import { expect, test } from "@playwright/test";
import { accountAddButton, asDesktop, openAccountCategory } from "./helpers.mjs";

async function open(page) {
  await asDesktop(page, "darwin");
  await page.addInitScript(() => { if (!sessionStorage.getItem("__kept")) { localStorage.removeItem("clipbox.vault.samples.v2"); sessionStorage.setItem("__kept", "1"); } });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  const dialog = page.getByRole("region", { name: "保险箱" });
  await expect(dialog.locator(".vault-entry").first()).toBeVisible();
  return dialog;
}

test("账号 全部: one card per website with every type of that site, 收款信息 last, and the sidebar counts match", async ({ page }) => {
  const dialog = await open(page);
  // Example (the 验证码 issuer), example.com (login, recovery) and the API key service "Example" are one website.
  const groups = dialog.locator(".vault-group");
  await expect(groups).toHaveCount(2);
  await expect(groups.first()).toHaveAttribute("aria-label", "example.com");
  await expect(groups.first().locator(".vault-type-chip")).toHaveText(["登录", "API", "恢复", "验证码"]);
  await expect(groups.last()).toHaveAttribute("aria-label", "收款信息");
  await expect(page.getByRole("navigation", { name: "分类" }).getByRole("button")).toHaveText(["登录1", "收款信息1", "API 密钥1", "验证码1", "恢复码1", "其他0"]);
  await expect(page.getByRole("navigation", { name: "快捷入口" }).getByRole("button", { name: /^全部/ })).toContainText("5");
  // The encryption note is only beside the title; the footer note is gone.
  await expect(dialog).not.toContainText("导出「账号备份」");
  await expect(page.locator(".section-note")).toHaveText("本机加密");
});

test("账号 rows: one copy button per type, the rest in the 「…」 menu", async ({ page }) => {
  const dialog = await open(page);
  const copied = () => page.evaluate(() => window.__copied);
  await dialog.getByRole("button", { name: "复制密码 【范例】Example 后台" }).click();
  await expect.poll(copied).toBe("Example-Only-123");
  await dialog.getByRole("button", { name: "复制密钥 【范例】接口密钥" }).click();
  await expect.poll(copied).toBe("demo_key_0000000000EXAMPLE");
  await dialog.getByRole("button", { name: "复制全部恢复码 【范例】恢复码" }).click();
  await expect.poll(copied).toBe("0000-1111\n2222-3333\n4444-5555");
  await dialog.getByRole("button", { name: "复制收款信息 【范例】美元电汇" }).click();
  await expect.poll(copied).toBe("Beneficiary Name: Example Trading Ltd\nBank Name: Example Bank\nAccount No. / IBAN: GB82WEST12345698765432\nSWIFT / BIC: DEUTDEFF\nCurrency: USD");
  await dialog.locator(".acct-row", { hasText: "验证码" }).getByRole("button", { name: /^复制验证码/ }).click();
  await expect.poll(copied).toMatch(/^\d{6}$/);
  // Everything else is in the menu.
  await dialog.getByRole("button", { name: "更多操作 【范例】接口密钥" }).click();
  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(["打开 / 修改", "改归类"]);
  await page.getByRole("menuitem", { name: "打开 / 修改" }).click();
  await expect(dialog.getByRole("button", { name: "显示密钥" })).toBeVisible();
  await dialog.getByRole("button", { name: "返回列表" }).click();
  await expect(dialog.locator(".vault-group").first()).toBeVisible();
});

test("账号 search looks at name, website and username but not the password", async ({ page }) => {
  const dialog = await open(page);
  const search = page.getByPlaceholder("搜索名称、网站、用户名");
  await search.fill("demo@example");
  await expect(dialog.locator(".vault-entry")).toHaveCount(1);
  await expect(dialog.locator(".vault-entry")).toContainText("Example 后台");
  await search.fill("Example-Only-123");
  await expect(dialog).toContainText("没有找到匹配的内容");
  await search.fill("收款");
  await expect(dialog.locator(".vault-entry")).toHaveCount(1);
  await search.fill("");
  await expect(dialog.locator(".vault-entry")).toHaveCount(5);
});

test("账号 新增: 全部 asks for the type, a category creates that type at once", async ({ page }) => {
  const dialog = await open(page);
  await accountAddButton(page).click();
  await page.getByRole("menuitem", { name: "API 密钥" }).click();
  await expect(dialog.getByPlaceholder("例如：客服 AI 接口")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^添加/ })).toHaveCount(0);
  await openAccountCategory(page, "恢复码");
  await accountAddButton(page).click();
  await expect(dialog.getByPlaceholder("例如：Google 恢复码")).toBeVisible();
  await expect(page.getByRole("heading", { name: "恢复码" })).toBeVisible();
});
