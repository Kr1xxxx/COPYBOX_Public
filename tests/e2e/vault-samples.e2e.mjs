import { expect, test } from "@playwright/test";
import { accountAddButton, asDesktop, openAccountCategory } from "./helpers.mjs";

const openAll = (page) => page.getByRole("navigation", { name: "快捷入口" }).getByRole("button", { name: /^全部/ }).click();

async function open(page) {
  await asDesktop(page, "darwin");
  await page.addInitScript(() => { if (!sessionStorage.getItem("__kept")) { localStorage.removeItem("clipbox.vault.samples.v2"); sessionStorage.setItem("__kept", "1"); } });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  const dialog = page.getByRole("region", { name: "保险箱" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("a new 保险箱 opens with clearly fake examples of each type, which one tap removes for good", async ({ page }) => {
  const dialog = await open(page);
  await expect(dialog).toContainText("范例");
  for (const group of ["登录", "收款信息", "API 密钥", "恢复码", "验证码"]) {
    await openAccountCategory(page, group);
    await expect(dialog).toContainText("【范例】");
  }
  await openAll(page);
  await dialog.getByRole("button", { name: "删除范例…" }).click();
  await expect(dialog).toContainText("将删除 5 条");
  await expect(dialog).toContainText("【范例】接口密钥");
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toContainText("里面带了几条");
  await dialog.getByRole("button", { name: "删除范例…" }).click();
  await dialog.getByRole("button", { name: "确认删除" }).click();
  await expect(dialog).toContainText("还没有账号");
  expect(await page.evaluate(() => localStorage.getItem("clipbox.totp.v1"))).toBeTruthy();
  // Closed and opened again, after a restart: they do not come back.
  await page.keyboard.press("Escape");
  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await expect(page.getByRole("region", { name: "保险箱" })).toContainText("还没有账号");
});

test("examples are added beside data that is already there and leave it untouched", async ({ page }) => {
  await asDesktop(page, "darwin");
  await page.addInitScript(() => { if (!sessionStorage.getItem("__kept")) { localStorage.removeItem("clipbox.vault.samples.v2"); sessionStorage.setItem("__kept", "1"); } });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.getByRole("button", { name: "账号" }).first().click();
  await openAccountCategory(page, "其他");
  await page.getByRole("button", { name: /新增/ }).first().click();
  const editor = page.locator(".inline-editor");
  await editor.locator("input").first().fill("仓库地址");
  await editor.locator("textarea").first().fill("台北市信义区 123 号");
  await editor.locator(".editor-save").first().click();
  await expect(page.locator(".native-row", { hasText: "仓库地址" })).toBeVisible();
  await page.getByRole("navigation", { name: "快捷入口" }).getByRole("button", { name: /^全部/ }).click();
  const dialog = page.getByRole("region", { name: "保险箱" });
  await expect(dialog.getByRole("region", { name: "其他网站" })).toContainText("仓库地址");
  await expect(dialog).toContainText("【范例】");
});

test("设置 → 清除范例 / 恢复范例 only touch the examples: own entries and edited examples stay", async ({ page }) => {
  const dialog = await open(page);
  // The user's own entries: a 验证码 and a 账号密码.
  await openAccountCategory(dialog.page(), "验证码");
  await accountAddButton(dialog.page()).click();
  await dialog.getByLabel("密钥或链接").fill("MFRGGZDFMZTWQ2LKNNWG23TP");
  await dialog.getByLabel("名称（可不填）").fill("我的邮箱");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("button", { name: "复制 我的邮箱 的验证码" })).toBeVisible();
  await openAccountCategory(dialog.page(), "登录");
  await accountAddButton(dialog.page()).click();
  await dialog.getByPlaceholder("例如：Shopify 后台").fill("我的店铺");
  await dialog.getByLabel("用户名 / 邮箱").fill("me@mine.test");
  await dialog.getByLabel("密码", { exact: true }).fill("mine-Pass-1");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("button", { name: /我的店铺/ })).toBeVisible();
  // One example is edited, so it counts as the user's.
  await openAccountCategory(dialog.page(), "收款信息");
  await dialog.locator(".vault-entry", { hasText: "【范例】美元电汇" }).click();
  await dialog.getByRole("button", { name: "修改" }).click();
  await dialog.getByLabel("银行名称").fill("My Own Bank");
  await dialog.getByRole("button", { name: "保存" }).click();
  await dialog.getByRole("button", { name: "确认修改" }).click();
  await expect(dialog).toContainText("My Own Bank");
  await page.keyboard.press("Escape");

  const settings = async () => { await page.getByRole("button", { name: /设置/ }).first().click(); const d = page.getByRole("dialog", { name: "设置" }); await d.getByRole("tab", { name: "数据" }).click(); return d; };
  let s = await settings();
  await s.getByRole("button", { name: "清除…" }).click();
  // Before anything is deleted the box says how many and which; own entries and the edited example are not on the list.
  const list = s.getByRole("status");
  await expect(list).toContainText("将删除 4 条");
  await expect(list).toContainText("【范例】接口密钥");
  for (const kept of ["我的邮箱", "我的店铺", "美元电汇"]) await expect(list).not.toContainText(kept);
  await s.getByRole("button", { name: "确认清除" }).click();
  await expect(page.getByText("已清除 4 条范例，1 条你改过的已保留")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  const after = page.getByRole("region", { name: "保险箱" });
  await openAll(page);
  await expect(after).toContainText("我的邮箱");
  await expect(after).toContainText("我的店铺");
  await expect(after).toContainText("美元电汇");
  await expect(after).not.toContainText("【范例】接口密钥");
  await expect(after).not.toContainText("【范例】恢复码");
  await expect(after).not.toContainText("【范例】Example 后台");
  await page.keyboard.press("Escape");

  // 恢复: the missing examples come back once, nothing is duplicated, the edited one is left alone.
  for (let round = 0; round < 2; round += 1) {
    s = await settings();
    await s.getByRole("button", { name: "恢复", exact: true }).click();
    await expect(page.getByText(round === 0 ? "已补回 4 条范例" : "范例都在，没有缺的")).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  const restored = page.getByRole("region", { name: "保险箱" });
  await openAll(page);
  await expect(restored.getByText("【范例】接口密钥")).toHaveCount(1);
  await expect(restored.getByText("【范例】Example 后台")).toHaveCount(1);
  await expect(restored.getByText("【范例】美元电汇")).toHaveCount(1);
  await expect(restored).toContainText("我的邮箱");
  await expect(restored).toContainText("我的店铺");
});

test("清除范例 and 恢复范例 are offered on Windows too", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.getByRole("button", { name: /设置/ }).first().click();
  const s = page.getByRole("dialog", { name: "设置" });
  await s.getByRole("tab", { name: "数据" }).click();
  await expect(s).toContainText("导入备份");
  await expect(s).toContainText("范例");
});

test("someone who opened an earlier 保险箱 (old flag set, own data present) still gets the examples on 账号", async ({ page }) => {
  await asDesktop(page, "darwin");
  await page.addInitScript(() => { if (!sessionStorage.getItem("__kept")) { localStorage.removeItem("clipbox.vault.samples.v2"); localStorage.setItem("clipbox.vault.samples.v1", "1"); sessionStorage.setItem("__kept", "1"); } });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  const vault = page.getByRole("region", { name: "保险箱" });
  await expect(vault).toContainText("【范例】");
});
