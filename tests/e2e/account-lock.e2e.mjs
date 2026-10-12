import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

async function openSettings(page) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("tab", { name: "数据" }).click();
  return settings;
}

async function setPassword(page, password) {
  const settings = await openSettings(page);
  await settings.getByRole("button", { name: "设置…" }).click();
  await settings.getByLabel("新密码", { exact: true }).fill(password);
  await settings.getByLabel("再输入一次新密码").fill(password);
  await settings.getByRole("button", { name: "保存" }).click();
  await expect(settings).toContainText("已设置");
  await settings.getByRole("button", { name: "关闭" }).first().click();
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

test("Windows: the 账号 page has no 其他 category and no old 目录 list", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await expect(page.getByRole("navigation", { name: "分类" }).getByRole("button")).toHaveText([/^登录/, /^收款信息/, /^API 密钥/, /^验证码/, /^恢复码/]);
  await expect(page.locator("body")).not.toContainText("未分类");
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
  await settings.getByRole("button", { name: "关闭" }).first().click();
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
  await expect(settings.getByRole("alert")).toContainText("至少 4 位");
  await settings.getByRole("button", { name: "取消" }).click();
  await settings.getByRole("button", { name: "关闭" }).first().click();
  await setPassword(page, "abcd1234");
  settings = await openSettings(page);
  await expect(settings).toContainText("先打开账号页、输入密码，才能导出");
  await expect(settings.locator(".settings-row", { hasText: "导出账号备份" }).getByRole("button")).toBeDisabled();
});

test("忘记密码: with a recovery email it offers a reset mail (needs the server, says so); without one it says it cannot reset", async ({ page }) => {
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
  await expect(settings).toContainText("已设置");
  await settings.getByRole("button", { name: "关闭" }).first().click();
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await page.getByRole("button", { name: "忘记密码" }).click();
  await expect(page.locator(".account-lock-forgot")).toContainText("l***@example.com");
  await expect(page.locator(".account-lock-forgot")).toContainText("不会被清空");
  await page.getByRole("button", { name: "发送重置邮件" }).click();
  await expect(page.getByRole("status")).toContainText("找回功能需要服务器，部署后开通");
});

test("忘记密码 without a recovery email says reset is not possible", async ({ page }) => {
  await asDesktop(page, "darwin");
  await seedSnippets(page);
  await setPassword(page, "abcd1234");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await page.getByRole("button", { name: "忘记密码" }).click();
  await expect(page.locator(".account-lock-forgot")).toContainText("没有设置找回邮箱");
  await expect(page.getByRole("button", { name: "发送重置邮件" })).toHaveCount(0);
});
