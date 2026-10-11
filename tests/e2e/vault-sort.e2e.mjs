import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

async function addSecret(page, label, text) {
  await page.getByRole("button", { name: /新增/ }).first().click();
  const editor = page.locator(".inline-editor");
  await editor.locator("input").first().fill(label);
  await editor.locator("textarea").first().fill(text);
  await editor.locator(".editor-save").first().click();
  await expect(page.locator(".native-row", { hasText: label })).toBeVisible();
}

async function openVault(page) {
  await page.locator(".kind-switch").getByRole("button", { name: "秘密" }).click();
  await page.locator(".vault-tabs").getByRole("button", { name: "全部" }).click();
  const dialog = page.getByRole("region", { name: "保险箱" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("old 秘密 entries are sorted by content in 全部, unknown ones go to 其他, and Lock can change type and website by hand", async ({ page }) => {
  await asDesktop(page, "darwin");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await seedSnippets(page);
  await page.getByRole("button", { name: "秘密" }).first().click();
  await page.locator(".vault-tabs").getByRole("button", { name: "其他" }).click();
  await addSecret(page, "客服 AI", "sk-ant-api03-ABCDEFGH1234");
  await addSecret(page, "仓库地址", "台北市信义区 123 号");
  await addSecret(page, "邮箱", "密码: hunter2");
  const dialog = await openVault(page);
  await expect(dialog.getByRole("region", { name: "Anthropic" })).toContainText("客服 AI");
  await expect(dialog.getByRole("region", { name: "Anthropic" })).toContainText("来自「秘密」");
  await expect(dialog.getByRole("region", { name: "其他网站" })).toContainText("仓库地址");
  await dialog.getByRole("button", { name: "按类型" }).click();
  await expect(dialog.getByRole("region", { name: "其他" })).toContainText("仓库地址");
  await expect(dialog.getByRole("region", { name: "账号密码" })).toContainText("邮箱");
  await expect(dialog.getByRole("region", { name: "API 密钥" })).toContainText("客服 AI");

  // By hand: the address becomes a 账号密码 of Google.
  const row = dialog.locator(".vault-entry-row", { hasText: "仓库地址" });
  await row.getByRole("button", { name: "改归类" }).click();
  await row.getByLabel("类型").selectOption("login");
  await row.getByLabel("所属网站").fill("谷歌");
  await row.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("region", { name: "账号密码" })).toContainText("仓库地址");
  await dialog.getByRole("button", { name: "按网站" }).click();
  await expect(dialog.getByRole("region", { name: "Google" })).toContainText("仓库地址");
  // Kept after a restart.
  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "秘密" }).click();
  await expect(page.getByRole("region", { name: "保险箱" }).getByRole("region", { name: "Google" })).toContainText("仓库地址");
  // 恢复自动: clearing the website and the type goes back to the guess.
  const again = page.getByRole("region", { name: "保险箱" });
  const row2 = again.locator(".vault-entry-row", { hasText: "仓库地址" });
  await row2.getByRole("button", { name: "改归类" }).click();
  await row2.getByLabel("类型").selectOption("other");
  await row2.getByLabel("所属网站").fill("");
  await row2.getByRole("button", { name: "保存" }).click();
  await expect(again.getByRole("region", { name: "其他网站" })).toContainText("仓库地址");
  // Opening an old entry shows it in the 其他 tab, where it can be edited, copied and trashed as before.
  await again.getByRole("button", { name: /邮箱/ }).first().click();
  await expect(page.locator(".vault-tabs button[aria-pressed=true]")).toHaveText("其他");
  await expect(page.locator(".native-row", { hasText: "邮箱" })).toBeVisible();
});

test("恢复码: add many at once, hidden until held, copy one or all, and 全部 groups it by site", async ({ page }) => {
  await asDesktop(page, "darwin");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  const dialog = await openVault(page);
  await dialog.getByRole("button", { name: "恢复码", exact: true }).click();
  await dialog.getByRole("button", { name: "添加恢复码" }).click();
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("alert").first()).toBeVisible();
  await dialog.getByPlaceholder("例如：Google 恢复码").fill("Google 恢复码");
  await dialog.getByPlaceholder("例如：Google 或 shopify.com").fill("Google");
  await dialog.getByLabel("恢复码", { exact: true }).fill("a1b2-c3d4\ne5f6-g7h8\na1b2-c3d4\ni9j0-k1l2");
  await expect(dialog).toContainText("识别到 3 个");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("button", { name: /Google 恢复码/ })).toContainText("3 个恢复码");
  await expect(dialog).not.toContainText("a1b2-c3d4");
  await dialog.getByRole("button", { name: "复制第 2 个恢复码" }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("e5f6-g7h8");
  await dialog.getByRole("button", { name: "复制全部" }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("a1b2-c3d4\ne5f6-g7h8\ni9j0-k1l2");
  const stored = await page.evaluate(() => localStorage.getItem("clipbox.vault-items.v1"));
  expect(stored).not.toContain("a1b2");
  const eye = dialog.getByRole("button", { name: "显示恢复码" });
  const box = await eye.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(dialog).toContainText("a1b2-c3d4");
  await page.mouse.up();
  await expect(dialog).not.toContainText("a1b2-c3d4");
  await dialog.getByRole("button", { name: "全部", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Google" })).toContainText("Google 恢复码");
});

test("Mac: 秘密 is the 保险箱 itself, with 新增 only inside 其他, and Windows has none of it", async ({ page }) => {
  await asDesktop(page, "darwin");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "秘密" }).click();
  await expect(page.getByRole("region", { name: "保险箱" })).toBeVisible();
  await expect(page.locator(".vault-tabs button")).toHaveText(["全部", "账号密码", "收款信息", "API 密钥", "恢复码", "验证码", "其他"]);
  await expect(page.locator(".toolbar").getByRole("button", { name: /^新增/ })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "保险箱" })).toHaveCount(0);
});
