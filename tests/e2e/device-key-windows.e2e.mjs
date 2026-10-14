import { expect, test } from "@playwright/test";
import { asDesktop, seedSnippets } from "./helpers.mjs";

// D-053: on Windows the vault's device key lives in Credential Manager, not next to the data. The fake Credential Manager
// keeps its value in sessionStorage so it survives a reload, like the real one survives a restart.
const DEVICE_KEY = "clipbox.device-key.v1";

async function withCredentialManager(page, { readFails = false } = {}) {
  await asDesktop(page, "win32");
  await page.addInitScript((fails) => {
    // An "old app" start (before this change) has no Credential Manager commands at all.
    if (sessionStorage.getItem("test.old-app") === "1") return;
    window.clipboxDesktop.deviceKeyGet = async () => { if (fails) throw new Error("unavailable"); return sessionStorage.getItem("test.credential"); };
    window.clipboxDesktop.deviceKeySet = async (key) => { sessionStorage.setItem("test.credential", key); };
  }, readFails);
}
const localKey = (page) => page.evaluate((name) => localStorage.getItem(name), DEVICE_KEY);
const credential = (page) => page.evaluate(() => sessionStorage.getItem("test.credential"));

test("Windows: an existing vault's key moves into Credential Manager and the 话术 still open after restarts", async ({ page }) => {
  await page.addInitScript(() => { if (sessionStorage.getItem("test.old-app") === null) sessionStorage.setItem("test.old-app", "1"); });
  await withCredentialManager(page);
  await seedSnippets(page);
  const rows = await page.locator(".native-row").count();
  const original = await localKey(page);
  expect(original).toBeTruthy();
  expect(await credential(page)).toBeNull();

  // The update: the same data, now opened by an app that has Credential Manager.
  await page.evaluate(() => sessionStorage.setItem("test.old-app", "0"));
  await page.reload();
  await page.waitForSelector(".native-row");
  await expect.poll(() => localKey(page)).toBeNull();
  expect(await credential(page)).toBe(original);
  await expect(page.locator(".native-row")).toHaveCount(rows);

  await page.reload();
  await page.waitForSelector(".native-row");
  await expect(page.locator(".native-row")).toHaveCount(rows);
  expect(await localKey(page)).toBeNull();
});

test("Windows: a new install keeps its key only in Credential Manager", async ({ page }) => {
  await withCredentialManager(page);
  await seedSnippets(page);
  await expect.poll(() => localKey(page)).toBeNull();
  expect(await credential(page)).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  await page.reload();
  await page.waitForSelector(".native-row");
  expect(await page.locator(".native-row").count()).toBeGreaterThan(30);
});

test("Windows: if Credential Manager cannot be read, the app opens with the key next to the data and keeps it", async ({ page }) => {
  await withCredentialManager(page, { readFails: true });
  await seedSnippets(page);
  const rows = await page.locator(".native-row").count();
  await page.reload();
  await page.waitForSelector(".native-row");
  await expect(page.locator(".native-row")).toHaveCount(rows);
  expect(await localKey(page)).toBeTruthy();
});

test("Windows: a 完整备份 carries the key, so it opens on a new computer with another Credential Manager key", async ({ page }) => {
  await withCredentialManager(page);
  await seedSnippets(page);
  await expect.poll(() => localKey(page)).toBeNull();
  await page.getByRole("button", { name: /设置/ }).first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("tab", { name: "数据" }).click();
  await settings.locator(".settings-row", { hasText: "完整备份" }).getByRole("button", { name: "导出…" }).click();
  const dialog = page.getByRole("dialog", { name: "完整备份" });
  await dialog.getByPlaceholder("至少 8 个字符").fill("move-1234");
  await dialog.getByPlaceholder("确认密码").fill("move-1234");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "加密并导出" }).click()]);
  const file = await download.path();

  // A new computer: no data, and Credential Manager already holds some other key.
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("clipbox.first-run-guide.v1", "1");
    for (const name of ["clipbox-images", "clipbox-image-thumbs"]) indexedDB.deleteDatabase(name);
    sessionStorage.setItem("test.credential", "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=");
  });
  await page.reload();
  await expect(page.locator(".native-row")).toHaveCount(0);
  await page.getByRole("button", { name: /设置/ }).first().click();
  await settings.getByRole("tab", { name: "数据" }).click();
  await settings.locator(".settings-row", { hasText: "从完整备份恢复" }).getByRole("button").click();
  const restore = page.getByRole("dialog", { name: "从完整备份恢复" });
  await restore.getByLabel("备份文件").setInputFiles(file);
  await restore.getByPlaceholder("输入导出时设置的密码").fill("move-1234");
  await restore.getByRole("button", { name: "验证并替换" }).click();
  await restore.getByRole("button", { name: "确认替换" }).click();
  await expect(page.locator(".native-row")).toHaveCount(34);
  await expect.poll(() => localKey(page)).toBeNull();
  expect(await credential(page)).not.toBe("CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=");
  await page.reload();
  await expect(page.locator(".native-row")).toHaveCount(34);
});
