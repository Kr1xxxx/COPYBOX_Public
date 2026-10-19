// D-042: a recovery code is never lost unseen, and the copy kept before encrypting goes away by itself.
import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

const CODE = /^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/;

async function openSettings(page) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("tab", { name: "安全" }).click();
  return settings;
}

// Sets the password and leaves the recovery code on screen, not yet confirmed.
async function startPassword(page, password) {
  const settings = await openSettings(page);
  await settings.getByRole("button", { name: "设置…" }).click();
  await settings.getByLabel("新密码", { exact: true }).fill(password);
  await settings.getByLabel("再输入一次新密码").fill(password);
  await settings.getByRole("button", { name: "保存" }).click();
  const code = (await settings.locator(".recovery-code-text").textContent()) ?? "";
  expect(code).toMatch(CODE);
  return { settings, code };
}

async function unlock(page, password) {
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  const lock = page.getByRole("form", { name: "账号页已上锁" });
  await lock.getByLabel("账号页密码").fill(password);
  await lock.getByRole("button", { name: "打开" }).click();
}

const vault = (page) => page.getByRole("region", { name: "保险箱" });

// Leaving the 账号 section no longer locks it (D-076), so these tests lock it with the auto-lock timer (needs page.clock).
async function autoLockAfterTenSeconds(settings) {
  await settings.getByRole("radiogroup", { name: "账号页自动上锁" }).getByRole("radio", { name: "10 秒" }).click();
}

async function waitForLock(page) {
  await page.clock.fastForward(11_000);
  await expect(page.getByRole("form", { name: "账号页已上锁" })).toBeVisible();
}

test("closing 设置 while the recovery code is on screen asks first; closing anyway gives a new code at the next unlock", async ({ page }) => {
  await page.clock.install();
  await asDesktop(page, "win32");
  await seedSnippets(page);
  const { settings, code } = await startPassword(page, "abcd1234");
  const ask = page.getByRole("alertdialog", { name: "恢复码还没保存，确定关闭吗？" });

  await settings.getByRole("button", { name: "关闭设置" }).click();
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "回去保存" }).click();
  await expect(ask).toHaveCount(0);
  await expect(settings.locator(".recovery-code-text")).toHaveText(code);

  await page.locator(".settings-backdrop").click({ position: { x: 4, y: 4 } });
  await expect(ask).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ask).toHaveCount(0);
  await expect(settings).toBeVisible();

  await settings.getByRole("button", { name: "关闭设置" }).click();
  await ask.getByRole("button", { name: "仍然关闭" }).click();
  await expect(settings).toHaveCount(0);

  await unlock(page, "abcd1234");
  const fresh = page.getByRole("group", { name: "新的恢复码" });
  await expect(fresh).toBeVisible();
  await expect(vault(page)).toHaveCount(0);
  const next = (await fresh.locator(".recovery-code-text").textContent()) ?? "";
  expect(next).toMatch(CODE);
  expect(next).not.toBe(code);
  await expect(fresh.getByRole("button", { name: "完成" })).toBeDisabled();
  await fresh.getByLabel("我已经把恢复码保存好了").check();
  await fresh.getByRole("button", { name: "完成" }).click();
  await expect(vault(page)).toBeVisible();

  // confirmed: the next unlock opens straight away, and the old code no longer works
  const security = await openSettings(page);
  await autoLockAfterTenSeconds(security);
  await security.getByRole("button", { name: "关闭设置" }).click();
  await waitForLock(page);
  await unlock(page, "abcd1234");
  await expect(vault(page)).toBeVisible();
  await expect(page.getByRole("group", { name: "新的恢复码" })).toHaveCount(0);
  await waitForLock(page);
  await page.getByRole("button", { name: "忘记密码" }).click();
  const recover = page.getByRole("group", { name: "用恢复码找回" });
  await recover.getByLabel("恢复码").fill(code);
  await recover.getByLabel("新密码", { exact: true }).fill("brand-new-pass");
  await recover.getByLabel("再输入一次新密码").fill("brand-new-pass");
  await recover.getByRole("button", { name: "用恢复码重设密码" }).click();
  await expect(page.locator(".account-lock-forgot")).toContainText("恢复码不对");
  await recover.getByLabel("恢复码").fill(next);
  await recover.getByRole("button", { name: "用恢复码重设密码" }).click();
  await expect(vault(page)).toBeVisible();
});

test("if the app stops before the recovery code is confirmed, the next unlock shows a new one", async ({ page }) => {
  await asDesktop(page, "darwin");
  await page.addInitScript(() => { if (!sessionStorage.getItem("__kept")) { localStorage.removeItem("clipbox.vault.samples.v2"); sessionStorage.setItem("__kept", "1"); } });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await expect(vault(page).locator(".vault-entry")).toHaveCount(5);
  await page.locator(".kind-switch").getByRole("button", { name: "话术" }).click();
  const { code } = await startPassword(page, "abcd1234");

  await page.reload();
  await page.waitForSelector(".app-shell");
  await unlock(page, "abcd1234");
  const fresh = page.getByRole("group", { name: "新的恢复码" });
  await expect(fresh).toBeVisible();
  const next = (await fresh.locator(".recovery-code-text").textContent()) ?? "";
  expect(next).toMatch(CODE);
  expect(next).not.toBe(code);
  await fresh.getByLabel("我已经把恢复码保存好了").check();
  await fresh.getByRole("button", { name: "完成" }).click();
  await expect(vault(page).locator(".vault-entry")).toHaveCount(5);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("clipbox.account-lock.v1") ?? "{}").codeShown)).toBe(true);
});

test("the copy kept before encrypting is deleted after the data opened fine in three later app sessions", async ({ page }) => {
  await page.clock.install();
  await asDesktop(page, "win32");
  await page.addInitScript(() => { if (!sessionStorage.getItem("__kept")) { localStorage.removeItem("clipbox.vault.samples.v2"); sessionStorage.setItem("__kept", "1"); } });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await expect(vault(page).locator(".vault-entry")).toHaveCount(5);
  await page.locator(".kind-switch").getByRole("button", { name: "话术" }).click();
  const { settings } = await startPassword(page, "abcd1234");
  await settings.getByLabel("我已经把恢复码保存好了").check();
  await settings.getByRole("button", { name: "完成" }).click();
  await expect(settings).toContainText("设密码前的备份");
  await expect(settings).toContainText("自动删除");
  await autoLockAfterTenSeconds(settings);
  await settings.getByRole("button", { name: "关闭设置" }).click();
  const copy = () => page.evaluate(() => localStorage.getItem("clipbox.account-premigration.v1"));
  const counted = () => page.evaluate(() => JSON.parse(localStorage.getItem("clipbox.account-premigration.v1") ?? "{}").unlocks?.length ?? -1);

  // the session that made the copy does not count
  await unlock(page, "abcd1234");
  await expect(vault(page).locator(".vault-entry")).toHaveCount(5);
  expect(await counted()).toBe(0);

  for (const expected of [1, 2]) {
    await page.reload();
    await page.waitForSelector(".app-shell");
    await unlock(page, "abcd1234");
    await expect(vault(page).locator(".vault-entry")).toHaveCount(5);
    await expect.poll(counted).toBe(expected);
    // a second unlock in the same session does not count again
    await waitForLock(page);
    await unlock(page, "abcd1234");
    await expect(vault(page).locator(".vault-entry")).toHaveCount(5);
    await page.waitForTimeout(300);
    expect(await counted()).toBe(expected);
  }

  await page.reload();
  await page.waitForSelector(".app-shell");
  await unlock(page, "abcd1234");
  await expect(vault(page).locator(".vault-entry")).toHaveCount(5);
  await expect.poll(copy).toBeNull();
  await page.locator(".kind-switch").getByRole("button", { name: "话术" }).click();
  const after = await openSettings(page);
  await expect(after).toContainText("账号页密码");
  await expect(after).not.toContainText("设密码前的备份");
});
