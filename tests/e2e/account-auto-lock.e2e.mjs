// D-070: 设置 → 安全. Once opened, the 账号 page locks again after 10 / 20 / 30 秒 without activity (20 by default),
// on whichever section is showing (D-077);
// 不上锁 asks first. Works with the slide (frost comes back) and with the 账号页密码 (the password screen comes back).
import { expect, test } from "@playwright/test";
import { AUTO_LOCK_KEY, asDesktop, guideSeenState, seedSnippets } from "./helpers.mjs";

// The default install: slide unlock on, auto-lock left at its default.
test.use({ storageState: async ({ baseURL }, provide) => { await provide(guideSeenState(baseURL, { slideUnlock: true, autoLock: null })); } });

const knob = (page) => page.getByRole("slider", { name: "滑动解锁" });
const vault = (page) => page.getByRole("region", { name: "保险箱" });

async function openAccounts(page) {
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
}

async function slideOpen(page) {
  await knob(page).focus();
  await knob(page).press("End");
  await expect(vault(page)).toBeVisible();
}

async function openSecurity(page) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("tab", { name: "安全" }).click();
  return settings;
}

for (const platform of ["win32", "darwin"]) {
  test(`${platform}: the slid-open 账号 page frosts again after 20 seconds without activity`, async ({ page }) => {
    await page.clock.install();
    await asDesktop(page, platform);
    await seedSnippets(page);
    await openAccounts(page);
    await slideOpen(page);
    await page.clock.fastForward(15_000);
    await expect(vault(page)).toBeVisible();
    // Activity starts the count again.
    await page.mouse.move(200, 300);
    await page.mouse.move(220, 310);
    await page.clock.fastForward(15_000);
    await expect(vault(page)).toBeVisible();
    await page.clock.fastForward(6_000);
    await expect(knob(page)).toBeVisible();
    await expect(page.locator(".account-veil-content")).toHaveAttribute("inert", "");
  });
}

test("switching to 话术 keeps the 账号 page open; the countdown still runs there (D-077)", async ({ page }) => {
  await page.clock.install();
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await openAccounts(page);
  await slideOpen(page);
  await page.locator(".kind-switch").getByRole("button", { name: "话术" }).click();
  await openAccounts(page);
  await expect(vault(page)).toBeVisible();
  await page.locator(".kind-switch").getByRole("button", { name: "话术" }).click();
  await page.clock.fastForward(21_000);
  await openAccounts(page);
  await expect(knob(page)).toBeVisible();
});

test("Settings has a 安全 page holding the 账号 locks and the auto-lock choice", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  const settings = await openSecurity(page);
  await expect(settings.getByRole("tab", { name: "安全" })).toHaveAttribute("aria-selected", "true");
  await expect(settings.locator(".settings-row", { hasText: "账号页密码" }).first()).toBeVisible();
  await expect(settings.getByRole("radiogroup", { name: "打开账号页先滑动解锁" })).toBeVisible();
  const choice = settings.getByRole("radiogroup", { name: "账号页自动上锁" });
  await expect(choice.getByRole("radio")).toHaveText(["10 秒", "20 秒", "30 秒", "不上锁"]);
  await expect(choice.getByRole("radio", { name: "20 秒" })).toHaveAttribute("aria-checked", "true");
  await expect(settings.locator(".settings-row", { hasText: "账号页自动上锁" })).toContainText("解锁后 20 秒内没有操作，账号页就会重新上锁");
  // These moved off the 数据 page.
  await settings.getByRole("tab", { name: "数据" }).click();
  await expect(settings.getByRole("radiogroup", { name: "打开账号页先滑动解锁" })).toBeHidden();
  await expect(settings.getByRole("radiogroup", { name: "账号页自动上锁" })).toBeHidden();
});

test("不上锁 asks first: 取消 keeps the lock, 确认不上锁 turns it off and the page stays open", async ({ page }) => {
  await page.clock.install();
  await asDesktop(page, "win32");
  await seedSnippets(page);
  const settings = await openSecurity(page);
  const choice = settings.getByRole("radiogroup", { name: "账号页自动上锁" });
  await choice.getByRole("radio", { name: "不上锁" }).click();
  const confirm = page.getByRole("alertdialog", { name: "不再自动上锁？" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("button", { name: "取消" })).toBeFocused();
  await confirm.getByRole("button", { name: "取消" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(choice.getByRole("radio", { name: "20 秒" })).toHaveAttribute("aria-checked", "true");
  // Escape also keeps it, and leaves 设置 open.
  await choice.getByRole("radio", { name: "不上锁" }).click();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(settings).toBeVisible();
  await expect(choice.getByRole("radio", { name: "20 秒" })).toHaveAttribute("aria-checked", "true");

  await choice.getByRole("radio", { name: "不上锁" }).click();
  await confirm.getByRole("button", { name: "确认不上锁" }).click();
  await expect(choice.getByRole("radio", { name: "不上锁" })).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate((key) => localStorage.getItem(key), AUTO_LOCK_KEY)).toBe("0");
  await settings.getByRole("button", { name: "关闭设置" }).click();
  await openAccounts(page);
  await slideOpen(page);
  await page.clock.fastForward(120_000);
  await expect(vault(page)).toBeVisible();
  await expect(knob(page)).toHaveCount(0);
});

test("with the 账号页密码 set and 10 秒 chosen, the password screen comes back", async ({ page }) => {
  await page.clock.install();
  await asDesktop(page, "darwin");
  await seedSnippets(page);
  const settings = await openSecurity(page);
  await settings.getByRole("button", { name: "设置…" }).click();
  await settings.getByLabel("新密码", { exact: true }).fill("abcd1234");
  await settings.getByLabel("再输入一次新密码").fill("abcd1234");
  await settings.getByRole("button", { name: "保存" }).click();
  await settings.getByLabel("我已经把恢复码保存好了").check();
  await settings.getByRole("button", { name: "完成" }).click();
  await settings.getByRole("radiogroup", { name: "账号页自动上锁" }).getByRole("radio", { name: "10 秒" }).click();
  await settings.getByRole("button", { name: "关闭设置" }).click();

  await openAccounts(page);
  const lock = page.getByRole("form", { name: "账号页已上锁" });
  await lock.getByLabel("账号页密码").fill("abcd1234");
  await lock.getByRole("button", { name: "打开" }).click();
  await expect(vault(page)).toBeVisible();
  await page.clock.fastForward(11_000);
  await expect(lock).toBeVisible();
  await expect(vault(page)).toHaveCount(0);
  // And it opens again with the password.
  await lock.getByLabel("账号页密码").fill("abcd1234");
  await lock.getByRole("button", { name: "打开" }).click();
  await expect(vault(page)).toBeVisible();
});
