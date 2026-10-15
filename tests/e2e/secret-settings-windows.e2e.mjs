import { expect, test } from "@playwright/test";
import { asDesktop } from "./helpers.mjs";

// D-057: on Windows the own TinyPNG keys and the 企业同步码 live in Credential Manager, not in plain text next to the
// data. The fake Credential Manager keeps its values in sessionStorage so they survive a reload, like a restart.
const KEY1 = "clipbox.tinify.key.v1";
const SYNC = "clipbox.shared-library-url";

async function withCredentialManager(page, { writeFails = false } = {}) {
  await asDesktop(page, "win32");
  await page.addInitScript((fails) => {
    // An "old app" start (before this change) has no secret commands at all.
    if (sessionStorage.getItem("test.old-app") === "1") return;
    const read = () => JSON.parse(sessionStorage.getItem("test.secrets") || "{}");
    const write = (all) => sessionStorage.setItem("test.secrets", JSON.stringify(all));
    window.clipboxDesktop.secretGet = async (name) => read()[name] ?? null;
    window.clipboxDesktop.secretSet = async (name, value) => { if (fails) throw new Error("unavailable"); write({ ...read(), [name]: value }); };
    window.clipboxDesktop.secretDelete = async (name) => { if (fails) throw new Error("unavailable"); const all = read(); delete all[name]; write(all); };
  }, writeFails);
}
const plain = (page, name) => page.evaluate((key) => localStorage.getItem(key), name);
const secrets = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("test.secrets") || "{}"));

async function openSettings(page) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  return page.locator(".settings-dialog");
}
async function compressCard(page) {
  const dialog = await openSettings(page);
  await dialog.getByRole("tab", { name: "数据" }).click();
  return dialog.locator("section[aria-labelledby=set-compress]");
}

test("Windows: a key and 同步码 saved by an older app move into Credential Manager and still show after restarts", async ({ page }) => {
  await page.addInitScript(() => { if (sessionStorage.getItem("test.old-app") === null) sessionStorage.setItem("test.old-app", "1"); });
  await withCredentialManager(page);
  await page.addInitScript(([k, s]) => {
    if (sessionStorage.getItem("test.seeded")) return;
    sessionStorage.setItem("test.seeded", "1");
    localStorage.setItem(k, "old-key");
    localStorage.setItem(s, "CB-OLD12345");
  }, [KEY1, SYNC]);
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  expect(await plain(page, KEY1)).toBe("old-key");

  // The update: the same data, now opened by an app that has Credential Manager.
  await page.evaluate(() => sessionStorage.setItem("test.old-app", "0"));
  await page.reload();
  await page.waitForSelector(".app-shell");
  await expect.poll(() => plain(page, KEY1)).toBeNull();
  await expect.poll(() => plain(page, SYNC)).toBeNull();
  expect(await secrets(page)).toEqual({ "tinify-key-1": "old-key", "shared-library-url": "CB-OLD12345" });

  await page.reload();
  await page.waitForSelector(".app-shell");
  const dialog = await openSettings(page);
  await expect(dialog.locator("#shared-url")).toHaveValue("CB-OLD12345");
  await dialog.getByRole("tab", { name: "数据" }).click();
  const card = dialog.locator("section[aria-labelledby=set-compress]");
  await card.getByRole("button", { name: "更换…" }).click();
  await expect(card.getByLabel("第一个密钥")).toHaveValue("old-key");
});

test("Windows: keys typed in 设置 go to Credential Manager only, and clearing them removes them there", async ({ page }) => {
  await withCredentialManager(page);
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  let card = await compressCard(page);
  await card.getByRole("button", { name: "填写…" }).click();
  await card.getByLabel("第一个密钥").fill("key-one");
  await card.getByLabel("第二个密钥（选填）").fill("key-two");
  await card.getByRole("button", { name: "保存" }).click();
  await expect(card).toContainText("正在使用第一个密钥，用完后自动换第二个");
  await expect.poll(() => secrets(page)).toEqual({ "tinify-key-1": "key-one", "tinify-key-2": "key-two" });
  expect(await plain(page, KEY1)).toBeNull();

  await page.reload();
  await page.waitForSelector(".app-shell");
  card = await compressCard(page);
  await expect(card).toContainText("正在使用第一个密钥，用完后自动换第二个");
  await card.getByRole("button", { name: "更换…" }).click();
  await card.getByLabel("第一个密钥").fill("");
  await card.getByLabel("第二个密钥（选填）").fill("");
  await card.getByRole("button", { name: "保存" }).click();
  await expect.poll(() => secrets(page)).toEqual({});
  await page.reload();
  await page.waitForSelector(".app-shell");
  card = await compressCard(page);
  await expect(card).toContainText("还没有填写密钥，新图片不会压缩");
});

test("Windows: if Credential Manager refuses, the key stays next to the data and keeps working", async ({ page }) => {
  await withCredentialManager(page, { writeFails: true });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  const dialog = await openSettings(page);
  await dialog.locator("#shared-url").fill("CB-KEEP1234");
  await expect.poll(() => plain(page, SYNC)).toBe("CB-KEEP1234");
  await page.reload();
  await page.waitForSelector(".app-shell");
  await openSettings(page);
  await expect(page.locator("#shared-url")).toHaveValue("CB-KEEP1234");
  expect(await plain(page, SYNC)).toBe("CB-KEEP1234");
});

test("Windows: a 完整备份 carries the keys and the 同步码, so a new computer gets them back", async ({ page }) => {
  await withCredentialManager(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem("test.secrets")) sessionStorage.setItem("test.secrets", JSON.stringify({ "tinify-key-1": "carried-key", "shared-library-url": "CB-CARRY123" })); });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  const settings = await openSettings(page);
  await settings.getByRole("tab", { name: "数据" }).click();
  await settings.locator(".settings-row", { hasText: "完整备份" }).getByRole("button", { name: "导出…" }).click();
  const dialog = page.getByRole("dialog", { name: "完整备份" });
  await dialog.getByPlaceholder("至少 8 个字符").fill("move-1234");
  await dialog.getByPlaceholder("确认密码").fill("move-1234");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "加密并导出" }).click()]);
  const file = await download.path();

  // A new computer: no data, nothing in Credential Manager.
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("clipbox.first-run-guide.v1", "1");
    for (const name of ["clipbox-images", "clipbox-image-thumbs"]) indexedDB.deleteDatabase(name);
    sessionStorage.setItem("test.secrets", "{}");
  });
  await page.reload();
  await page.waitForSelector(".app-shell");
  await openSettings(page);
  await settings.getByRole("tab", { name: "数据" }).click();
  await settings.locator(".settings-row", { hasText: "从完整备份恢复" }).getByRole("button").click();
  const restore = page.getByRole("dialog", { name: "从完整备份恢复" });
  await restore.getByLabel("备份文件").setInputFiles(file);
  await restore.getByPlaceholder("输入导出时设置的密码").fill("move-1234");
  await restore.getByRole("button", { name: "验证并替换" }).click();
  // The restore reloads the page; read the results only after that start.
  await Promise.all([page.waitForEvent("load"), restore.getByRole("button", { name: "确认替换" }).click()]);
  await page.waitForSelector(".app-shell");
  await expect.poll(() => secrets(page)).toEqual({ "tinify-key-1": "carried-key", "shared-library-url": "CB-CARRY123" });
  await expect.poll(() => plain(page, KEY1)).toBeNull();
});
