import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

// The Mac command line door: any program running as this user can reach it, so a 秘密 only leaves the app after the
// person here clicks 允许; a locked 账号 page refuses at once. Ordinary 话术 commands need no question.
async function withAutomation(page) {
  await asDesktop(page, "darwin");
  await page.addInitScript(() => {
    window.__answers = {};
    window.clipboxDesktop.onAutomationCommand = (callback) => { window.__sendAutomation = callback; return () => {}; };
    window.clipboxDesktop.respondAutomationCommand = (id, response) => { window.__answers[id] = response; };
  });
  await seedSnippets(page);
  await page.waitForFunction(() => typeof window.__sendAutomation === "function");
}

const send = (page, requestId, command) => page.evaluate(([id, cmd]) => window.__sendAutomation({ requestId: id, command: cmd }), [requestId, command]);
const answer = async (page, requestId) => {
  await page.waitForFunction((id) => window.__answers[id] !== undefined, requestId);
  return page.evaluate((id) => window.__answers[id], requestId);
};
const exportCommand = { action: "secret-export", password: "backup-password", confirmed: true };

test("macOS: a 秘密 export over the command line waits for 允许, and 拒绝 refuses it", async ({ page }) => {
  await withAutomation(page);
  await send(page, "status", { action: "status" });
  expect((await answer(page, "status")).ok).toBe(true);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  await send(page, "denied", exportCommand);
  const dialog = page.getByRole("alertdialog", { name: "允许读取秘密吗？" });
  await expect(dialog).toContainText("导出全部秘密");
  await expect(dialog.getByRole("button", { name: "拒绝" })).toBeFocused();
  // Same small card as the delete confirmation (390px), title first with nothing above it, buttons on one row.
  const card = await dialog.boundingBox();
  expect(card.width).toBeLessThanOrEqual(400);
  expect(await dialog.locator("header > *").first().evaluate((node) => node.tagName)).toBe("H2");
  const denyBox = await dialog.getByRole("button", { name: "拒绝" }).boundingBox();
  const allowBox = await dialog.getByRole("button", { name: "允许", exact: true }).boundingBox();
  expect(Math.abs(denyBox.y - allowBox.y)).toBeLessThan(1);
  expect(await page.evaluate(() => window.__answers.denied)).toBeUndefined();
  await dialog.getByRole("button", { name: "拒绝" }).click();
  expect(await answer(page, "denied")).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
  await expect(dialog).toHaveCount(0);

  await send(page, "escaped", exportCommand);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await answer(page, "escaped")).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });

  await send(page, "allowed", exportCommand);
  await dialog.getByRole("button", { name: "允许" }).click();
  const allowed = await answer(page, "allowed");
  expect(allowed).toMatchObject({ ok: true, action: "secret-export" });
  expect(allowed.backup.format).toBe("clipbox-secure-backup");
});

test("macOS: while one question is open a second 秘密 request is refused", async ({ page }) => {
  await withAutomation(page);
  await send(page, "first", exportCommand);
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await send(page, "second", { action: "secret-get", reference: "clipbox://secret/x" });
  expect(await answer(page, "second")).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
  await page.getByRole("alertdialog").getByRole("button", { name: "拒绝" }).click();
  expect(await answer(page, "first")).toMatchObject({ ok: false });
});

test("macOS: with a 账号 password set, a 秘密 request is refused without asking until the page is unlocked", async ({ page }) => {
  await withAutomation(page);
  await page.getByRole("button", { name: /设置/ }).first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("tab", { name: "数据" }).click();
  await settings.getByRole("button", { name: "设置…" }).click();
  await settings.getByLabel("新密码", { exact: true }).fill("abcd1234");
  await settings.getByLabel("再输入一次新密码").fill("abcd1234");
  await settings.getByRole("button", { name: "保存" }).click();
  await settings.getByLabel("我已经把恢复码保存好了").check();
  await settings.getByRole("button", { name: "完成" }).click();
  await settings.getByRole("button", { name: "关闭设置" }).click();

  await send(page, "locked", exportCommand);
  expect(await answer(page, "locked")).toMatchObject({ ok: false, error: { code: "ACCOUNT_LOCKED" } });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  const lock = page.getByRole("form", { name: "账号页已上锁" });
  await lock.getByLabel("账号页密码").fill("abcd1234");
  await lock.getByRole("button", { name: "打开" }).click();
  await expect(lock).toHaveCount(0);
  await send(page, "unlocked", exportCommand);
  await page.getByRole("alertdialog").getByRole("button", { name: "允许" }).click();
  expect(await answer(page, "unlocked")).toMatchObject({ ok: true });
});
