import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

async function openSettings(page) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("tab", { name: "安全" }).click();
  return settings;
}

async function setPassword(page, password) {
  const settings = await openSettings(page);
  await settings.getByRole("button", { name: "设置…" }).click();
  await settings.getByLabel("新密码", { exact: true }).fill(password);
  await settings.getByLabel("再输入一次新密码").fill(password);
  await settings.getByRole("button", { name: "保存" }).click();
  // The password now also encrypts the data: a recovery code is shown once and must be ticked as saved.
  const code = (await settings.locator(".recovery-code-text").textContent()) ?? "";
  expect(code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
  await settings.getByLabel("我已经把恢复码保存好了").check();
  await settings.getByRole("button", { name: "完成" }).click();
  await expect(settings).toContainText("已设置");
  await settings.getByRole("button", { name: "关闭设置" }).click();
  return code;
}

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: a password locks the 账号 page until it is entered, and locks again after leaving`, async ({ page }) => {
    await asDesktop(page, platform);
    await seedSnippets(page);
    await setPassword(page, "abcd1234");
    const kinds = page.locator(".kind-switch");
    await kinds.getByRole("button", { name: "账号" }).click();
    const lock = page.getByRole("form", { name: "账号页已上锁" });
    await expect(lock).toBeVisible();
    await expect(page.getByRole("region", { name: "保险箱" })).toHaveCount(0);
    await lock.getByLabel("账号页密码").fill("wrong-one");
    await lock.getByRole("button", { name: "打开" }).click();
    await expect(lock.getByRole("alert")).toContainText("密码不对");
    await expect(page.getByRole("region", { name: "保险箱" })).toHaveCount(0);
    await lock.getByLabel("账号页密码").fill("abcd1234");
    await lock.getByRole("button", { name: "打开" }).click();
    await expect(page.getByRole("region", { name: "保险箱" })).toBeVisible();
    await kinds.getByRole("button", { name: "话术" }).click();
    await kinds.getByRole("button", { name: "账号" }).click();
    await expect(page.getByRole("form", { name: "账号页已上锁" })).toBeVisible();
  });
}

test("Windows: the 账号 page has no 其他, API 密钥 or 恢复码 category and no old 目录 list", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await expect(page.getByRole("navigation", { name: "分类" }).getByRole("button")).toHaveText([/^登录/, /^收款信息/, /^验证码/, /^笔记/]);
  await expect(page.locator("body")).not.toContainText("未分类");
  await page.getByRole("button", { name: /新增/ }).first().click();
  await expect(page.getByRole("menuitem")).toHaveText(["登录", "收款信息", "验证码", "笔记"]);
  await page.keyboard.press("Escape");
});

test("the password can be changed (old one needed) and turned off", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await setPassword(page, "abcd1234");
  const settings = await openSettings(page);
  await settings.getByRole("button", { name: "修改…" }).click();
  await settings.getByLabel("现在的密码", { exact: true }).fill("nope");
  await settings.getByLabel("新密码", { exact: true }).fill("newpass99");
  await settings.getByLabel("再输入一次新密码").fill("newpass99");
  await settings.getByRole("button", { name: "保存" }).click();
  await expect(settings.getByRole("alert")).toContainText("现在的密码不对");
  await settings.getByLabel("现在的密码", { exact: true }).fill("abcd1234");
  await settings.getByRole("button", { name: "保存" }).click();
  await expect(settings).toContainText("已设置");
  await settings.getByRole("button", { name: "关闭…" }).click();
  await settings.getByLabel("现在的密码", { exact: true }).fill("newpass99");
  await settings.getByRole("button", { name: "关闭密码" }).click();
  await expect(settings).toContainText("未设置");
  await settings.getByRole("button", { name: "关闭设置" }).click();
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await expect(page.getByRole("region", { name: "保险箱" })).toBeVisible();
});

test("a short password is refused, and the account backup cannot be exported while locked", async ({ page }) => {
  await asDesktop(page, "darwin");
  await seedSnippets(page);
  let settings = await openSettings(page);
  await settings.getByRole("button", { name: "设置…" }).click();
  await settings.getByLabel("新密码", { exact: true }).fill("abc");
  await settings.getByLabel("再输入一次新密码").fill("abc");
  await settings.getByRole("button", { name: "保存" }).click();
  await expect(settings.getByRole("alert")).toContainText("至少 8 位");
  await settings.getByRole("button", { name: "取消" }).click();
  await settings.getByRole("button", { name: "关闭设置" }).click();
  await setPassword(page, "abcd1234");
  settings = await openSettings(page);
  await settings.getByRole("tab", { name: "数据" }).click();
  await expect(settings).toContainText("先打开账号页、输入密码，才能导出");
  await expect(settings.locator(".settings-row", { hasText: "导出账号备份" }).getByRole("button")).toBeDisabled();
});

test("忘记密码: with a recovery email it offers a reset mail (needs the server, says so); the recovery code is the way back today", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  const settings = await openSettings(page);
  await settings.getByRole("button", { name: "设置…" }).click();
  await settings.getByLabel("新密码", { exact: true }).fill("abcd1234");
  await settings.getByLabel("再输入一次新密码").fill("abcd1234");
  await settings.getByLabel("找回邮箱").fill("bad");
  await settings.getByRole("button", { name: "保存" }).click();
  await expect(settings.getByRole("alert")).toContainText("邮箱格式不对");
  await settings.getByLabel("找回邮箱").fill("lock@example.com");
  await settings.getByRole("button", { name: "保存" }).click();
  await settings.getByLabel("我已经把恢复码保存好了").check();
  await settings.getByRole("button", { name: "完成" }).click();
  await settings.getByRole("button", { name: "关闭设置" }).click();
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await page.getByRole("button", { name: "忘记密码" }).click();
  await expect(page.locator(".account-lock-forgot")).toContainText("l***@example.com");
  await page.getByRole("button", { name: "发送重置邮件" }).click();
  await expect(page.locator(".account-lock-forgot small[role=status]")).toContainText("找回功能需要服务器，部署后开通");
});

test("the recovery code reopens the data and sets a new password; the old password stops working; nothing is lost", async ({ page }) => {
  await asDesktop(page, "darwin");
  await page.addInitScript(() => { if (!sessionStorage.getItem("__kept")) { localStorage.removeItem("clipbox.vault.samples.v2"); sessionStorage.setItem("__kept", "1"); } });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await expect(page.getByRole("region", { name: "保险箱" }).locator(".vault-entry")).toHaveCount(5);
  await page.locator(".kind-switch").getByRole("button", { name: "话术" }).click();
  const code = await setPassword(page, "abcd1234");
  const kinds = page.locator(".kind-switch");
  await kinds.getByRole("button", { name: "账号" }).click();
  await page.getByRole("button", { name: "忘记密码" }).click();
  const recover = page.getByRole("group", { name: "用恢复码找回" });
  await recover.getByLabel("恢复码").fill("AAAA-BBBB-CCCC-DDDD-EEEE");
  await recover.getByLabel("新密码", { exact: true }).fill("brand-new-pass");
  await recover.getByLabel("再输入一次新密码").fill("brand-new-pass");
  await recover.getByRole("button", { name: "用恢复码重设密码" }).click();
  await expect(page.locator(".account-lock-forgot")).toContainText("恢复码不对");
  await recover.getByLabel("恢复码").fill(code.toLowerCase());
  await recover.getByRole("button", { name: "用恢复码重设密码" }).click();
  await expect(page.getByRole("region", { name: "保险箱" }).locator(".vault-entry")).toHaveCount(5);
  await kinds.getByRole("button", { name: "话术" }).click();
  await kinds.getByRole("button", { name: "账号" }).click();
  await page.getByLabel("账号页密码").fill("abcd1234");
  await page.getByRole("button", { name: "打开" }).click();
  await expect(page.getByRole("alert")).toContainText("密码不对");
  await page.getByLabel("账号页密码").fill("brand-new-pass");
  await page.getByRole("button", { name: "打开" }).click();
  await expect(page.getByRole("region", { name: "保险箱" }).locator(".vault-entry")).toHaveCount(5);
});

test("setting a password keeps every account entry, leaves a deletable backup, and turning it off keeps them too", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.addInitScript(() => { if (!sessionStorage.getItem("__kept")) { localStorage.removeItem("clipbox.vault.samples.v2"); sessionStorage.setItem("__kept", "1"); } });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  const kinds = page.locator(".kind-switch");
  await kinds.getByRole("button", { name: "账号" }).click();
  await expect(page.getByRole("region", { name: "保险箱" }).locator(".vault-entry")).toHaveCount(5);
  await kinds.getByRole("button", { name: "话术" }).click();
  await setPassword(page, "abcd1234");
  let settings = await openSettings(page);
  await expect(settings).toContainText("设密码前的备份");
  await settings.getByRole("button", { name: "删除备份…" }).click();
  await settings.getByRole("button", { name: "确认删除备份" }).click();
  await expect(settings).not.toContainText("设密码前的备份");
  await settings.getByRole("button", { name: "关闭…" }).click();
  await settings.getByLabel("现在的密码", { exact: true }).fill("wrong-password");
  await settings.getByRole("button", { name: "关闭密码" }).click();
  await expect(settings.getByRole("alert")).toContainText("现在的密码不对");
  await settings.getByLabel("现在的密码", { exact: true }).fill("abcd1234");
  await settings.getByRole("button", { name: "关闭密码" }).click();
  await expect(settings).toContainText("未设置");
  await settings.getByRole("button", { name: "关闭设置" }).click();
  await kinds.getByRole("button", { name: "账号" }).click();
  await expect(page.getByRole("region", { name: "保险箱" }).locator(".vault-entry")).toHaveCount(5);
});

test("忘记密码 without a recovery email still offers the recovery code", async ({ page }) => {
  await asDesktop(page, "darwin");
  await seedSnippets(page);
  await setPassword(page, "abcd1234");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await page.getByRole("button", { name: "忘记密码" }).click();
  await expect(page.getByRole("group", { name: "用恢复码找回" })).toBeVisible();
  await expect(page.locator(".account-lock-forgot")).toContainText("没有设置找回邮箱");
  await expect(page.getByRole("button", { name: "发送重置邮件" })).toHaveCount(0);
});
