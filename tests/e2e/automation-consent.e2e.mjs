import { expect, test } from "@playwright/test";
import { asDesktop, openAccountCategory, seedSnippets, settle } from "./helpers.mjs";

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
  // Measured once the card has finished sliding in: mid-animation the two buttons are read at different moments.
  await settle(page);
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
  await settings.getByRole("tab", { name: "安全" }).click();
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

const codex = { name: "codex", id: "/opt/homebrew/bin/codex" };
const sendFrom = (page, requestId, command, caller) => page.evaluate(([id, cmd, who]) => window.__sendAutomation({ requestId: id, command: cmd, caller: who }), [requestId, command, caller]);

test("macOS: 始终允许 lets the same program read a 秘密 without asking, other programs and exports are still asked, 设置 can take it back", async ({ page }) => {
  await withAutomation(page);
  await page.getByRole("button", { name: "账号" }).first().click();
  await openAccountCategory(page, "其他");
  await page.getByRole("button", { name: /新增/ }).first().click();
  const editor = page.locator(".inline-editor");
  await editor.locator("input").first().fill("测试令牌");
  await editor.locator("textarea").first().fill("token-value-123");
  await editor.locator(".editor-save").first().click();
  const row = page.locator(".native-row", { hasText: "测试令牌" });
  await expect(row).toBeVisible();
  const id = await row.locator("xpath=ancestor-or-self::*[@data-sort-id][1]").getAttribute("data-sort-id");
  const getCommand = { action: "secret-get", reference: `clipbox://secret/${encodeURIComponent(id)}` };
  const dialog = page.getByRole("alertdialog", { name: "允许读取秘密吗？" });

  // Without knowing who asked there is no 始终允许.
  await send(page, "unknown", getCommand);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "始终允许" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "拒绝" }).click();
  await answer(page, "unknown");

  await sendFrom(page, "first", getCommand, codex);
  await expect(dialog).toContainText("来自：codex");
  await dialog.getByRole("button", { name: "始终允许" }).click();
  expect(await answer(page, "first")).toMatchObject({ ok: true, secret: { value: "token-value-123" } });

  await sendFrom(page, "again", getCommand, codex);
  expect(await answer(page, "again")).toMatchObject({ ok: true, secret: { value: "token-value-123" } });
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("已自动允许「codex」读取秘密")).toBeVisible();

  // Another program with the same name but another file is asked.
  await sendFrom(page, "other", getCommand, { name: "codex", id: "/tmp/codex" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "拒绝" }).click();
  expect(await answer(page, "other")).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });

  // Exporting all 秘密 is always asked, and offers no 始终允许.
  await sendFrom(page, "export", exportCommand, codex);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "始终允许" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "拒绝" }).click();
  await answer(page, "export");

  await page.getByRole("button", { name: /设置/ }).first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("tab", { name: "安全" }).click();
  const list = settings.getByRole("list", { name: "始终允许的程序" });
  await expect(list).toContainText("codex");
  await expect(list).toContainText("/opt/homebrew/bin/codex");
  await settings.getByRole("button", { name: "取消始终允许 codex" }).click();
  await expect(settings.getByText("还没有", { exact: true })).toBeVisible();
  await settings.getByRole("button", { name: "关闭设置" }).click();

  await sendFrom(page, "revoked", getCommand, codex);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "拒绝" }).click();
  expect(await answer(page, "revoked")).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
});

test("Windows: there is no 始终允许的程序 card in 设置", async ({ page }) => {
  await asDesktop(page, "win32");
  await seedSnippets(page);
  await page.getByRole("button", { name: /设置/ }).first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("tab", { name: "安全" }).click();
  await expect(settings.getByRole("heading", { name: "始终允许的程序" })).toHaveCount(0);
});
