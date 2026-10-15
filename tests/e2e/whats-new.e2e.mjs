import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { asDesktop, seedSnippets } from "./helpers.mjs";

// 更新通知 (D-070): a notice that comes with a 同步码 push shows once as a small card; a sample can be shown by event.
const V1 = fileURLToPath(new URL("../../docs/samples/shared-library-v1.json", import.meta.url));
const V2 = fileURLToPath(new URL("../../docs/samples/shared-library-v2.json", import.meta.url));

function withNotice(source, notice) {
  const library = JSON.parse(readFileSync(source, "utf8"));
  const path = join(mkdtempSync(join(tmpdir(), "clipbox-notice-")), "library.json");
  writeFileSync(path, JSON.stringify({ ...library, notice }));
  return path;
}

async function openData(page) {
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.getByRole("dialog", { name: "设置" }).getByRole("tab", { name: "数据" }).click();
}

async function syncFile(page, file) {
  const settings = page.locator(".settings-dialog");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), settings.getByRole("button", { name: "选公司文件…" }).click()]);
  await chooser.setFiles(file);
  await expect(settings.locator(".shared-summary")).toBeVisible();
}

test.beforeEach(async ({ page }) => { await seedSnippets(page); });

test("a 同步码 push with a notice shows it once; the first sync of a library stays quiet", async ({ page }) => {
  await openData(page);
  // First time this device gets the library: the notice is about older changes, so it is only remembered.
  await syncFile(page, withNotice(V1, { id: "XS-1", items: ["新增 3 条话术"] }));
  await expect(page.locator(".whats-new-dialog")).toHaveCount(0);

  await syncFile(page, withNotice(V2, { id: "XS-2", items: ["新增 1 条话术", "新增 2 条 Tips"] }));
  const card = page.getByRole("dialog", { name: "公司话术有更新" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("不用更新软件，已经自动同步好了");
  await expect(card.getByRole("listitem")).toHaveText(["新增 1 条话术", "新增 2 条 Tips"]);
  await expect(card.getByRole("button", { name: "知道了" })).toBeFocused();
  // Brand look (brand-guidelines): light surface, dark button.
  expect(await card.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(250, 249, 245)");
  expect(await card.getByRole("button", { name: "知道了" }).evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(20, 20, 19)");
  await card.getByRole("button", { name: "知道了" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "设置" })).toBeVisible();

  // The same push again, or after a restart: nothing.
  await syncFile(page, withNotice(V2, { id: "XS-2", items: ["新增 1 条话术", "新增 2 条 Tips"] }));
  await expect(page.locator(".whats-new-dialog")).toHaveCount(0);
  await page.reload();
  await page.waitForSelector(".app-shell");
  await openData(page);
  await syncFile(page, withNotice(V2, { id: "XS-2", items: ["新增 1 条话术", "新增 2 条 Tips"] }));
  await expect(page.locator(".whats-new-dialog")).toHaveCount(0);
});

test("Escape closes the notice and leaves the settings open", async ({ page }) => {
  await openData(page);
  await syncFile(page, V1);
  await syncFile(page, withNotice(V2, { id: "XS-3", title: "新功能", items: ["话术可以分享给同事了"] }));
  const card = page.getByRole("dialog", { name: "新功能" });
  await expect(card).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "设置" })).toBeVisible();
});

test("the web preview can show a sample app notice", async ({ page }) => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("clipbox:whats-new", { detail: { kind: "app", items: ["新增：话术可以分享给同事"] } })));
  const card = page.getByRole("dialog", { name: "Copyboxx 已更新" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("listitem")).toHaveText(["新增：话术可以分享给同事"]);
  await card.getByRole("button", { name: "知道了" }).click();
  await expect(card).toHaveCount(0);
});

test("the installed app remembers its version; a version without lines shows nothing", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.addInitScript(() => { window.clipboxDesktop.getVersion = async () => "1.99.0"; });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("clipbox.whats-new.v1") || "{}").version)).toBe("1.99.0");
  await expect(page.locator(".whats-new-dialog")).toHaveCount(0);
});
