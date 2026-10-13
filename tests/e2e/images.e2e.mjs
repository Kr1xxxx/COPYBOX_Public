import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { asDesktop, openAccountCategory } from "./helpers.mjs";

const PNG_FILE = fileURLToPath(new URL("../fixtures/sample-gradient.png", import.meta.url));
const JPG_FILE = fileURLToPath(new URL("../fixtures/sample-photo.jpg", import.meta.url));
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

async function openApp(page, platform = "win32") {
  await asDesktop(page, platform, { imageView: "list" });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
}

async function openImages(page, platform = "win32") {
  await openApp(page, platform);
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await expect(page.locator(".image-section")).toBeVisible();
}

async function addImages(page, files) {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "新增图片" }).click(),
  ]);
  await chooser.setFiles(files);
}

const rows = (page) => page.locator(".image-row");

test("Windows: the sections are 话术, 账号 and 图片, and 备注 is gone", async ({ page }) => {
  await openApp(page, "win32");
  await expect(page.locator(".kind-switch button")).toHaveText(["话术", "图片", "账号"]);
  await expect(page.locator("body")).not.toContainText("备注");
  await page.getByRole("button", { name: /设置/ }).first().click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await expect(settings).toContainText("导出话术备份");
  await expect(settings).not.toContainText("备注");
});

test("macOS: the sections are 话术, 账号 and 图片, and 账号 still opens", async ({ page }) => {
  await openApp(page, "darwin");
  await expect(page.locator(".kind-switch button")).toHaveText(["话术", "图片", "账号"]);
  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await openAccountCategory(page, "其他");
  await expect(page.locator("body")).toContainText("默认只复制引用");
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await expect(page.locator("body")).toContainText("还没有图片，先添加第一张");
  await page.locator(".kind-switch").getByRole("button", { name: "话术" }).click();
  await expect(page.locator(".kind-switch button.active")).toHaveText("话术");
});

test("the empty 图片 page invites the first image and hides folders and favourites (the 回收站 entry is always there)", async ({ page }) => {
  await openImages(page);
  await expect(page.locator("body")).toContainText("还没有图片，先添加第一张");
  await expect(page.locator("body")).toContainText("把常发的图片存进来，一键复制。");
  await expect(page.getByRole("button", { name: "新增第一张" })).toBeVisible();
  await expect(page.getByPlaceholder("搜索图片标题")).toBeVisible();
  await expect(page.locator(".sidebar .nav-item", { hasText: "全部图片" })).toBeVisible();
  await expect(page.locator(".sidebar .nav-footer").getByRole("button", { name: /回收站/ })).toBeVisible();
  for (const hidden of ["最近", "新建目录"]) await expect(page.locator(".sidebar")).not.toContainText(hidden);
  await expect(page.locator(".sidebar").getByRole("button", { name: "设置" })).toBeVisible();
});

test("adding through the file chooser makes a row titled with the file name, and copy puts a PNG on the clipboard", async ({ page }) => {
  await openImages(page);
  await addImages(page, PNG_FILE);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("sample-gradient");
  await expect(page.locator(".sidebar .nav-item", { hasText: "全部图片" })).toContainText("1");
  await expect(page.locator(".toast")).toContainText("图片已加密保存");
  await expect.poll(() => page.locator(".image-thumb img").evaluate((img) => img.naturalWidth)).toBe(48);

  await page.getByRole("button", { name: "复制 sample-gradient" }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedImage)).toEqual(PNG_SIGNATURE);
  expect(await page.evaluate(() => window.__copiedImageLength)).toBe(readFileSync(PNG_FILE).length);
  await expect(rows(page).first()).toHaveClass(/copied/);
  await expect(page.locator("[role=status]").filter({ hasText: "已复制" }).first()).toBeAttached();
});

test("a JPEG is copied as a PNG", async ({ page }) => {
  await openImages(page);
  await addImages(page, JPG_FILE);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("sample-photo");
  await page.getByRole("button", { name: "复制 sample-photo" }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedImage)).toEqual(PNG_SIGNATURE);
  expect(await page.evaluate(() => window.__copiedImageLength)).toBeGreaterThan(readFileSync(JPG_FILE).length);
});

test("selecting a row shows the image larger with 复制, 改名 and 删除", async ({ page }) => {
  await openImages(page);
  await addImages(page, PNG_FILE);
  await expect(rows(page)).toHaveCount(1);
  await rows(page).first().locator(".row-main").click();
  const row = page.locator(".image-row.selected");
  await expect(row.locator(".image-preview img")).toBeVisible();
  await expect.poll(() => row.locator(".image-preview img").evaluate((img) => img.naturalWidth)).toBe(48);
  for (const name of ["复制", "改名", "删除"]) await expect(row.getByRole("button", { name, exact: true })).toBeVisible();
  const box = await row.locator(".image-preview img").boundingBox();
  const panel = await page.locator(".content-panel").boundingBox();
  expect(box.width).toBeLessThanOrEqual(panel.width);
  expect(box.height).toBeLessThanOrEqual(260);
  await row.getByRole("button", { name: "复制", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedImage)).toEqual(PNG_SIGNATURE);
  await row.locator(".row-main").click();
  await expect(page.locator(".image-row.selected")).toHaveCount(0);
});

test("opening the last of many rows scrolls all of it into view", async ({ page }) => {
  await openImages(page);
  const buffer = readFileSync(PNG_FILE);
  await addImages(page, Array.from({ length: 7 }, (_, index) => ({ name: `图${index + 1}.png`, mimeType: "image/png", buffer })));
  await expect(rows(page)).toHaveCount(7);
  await rows(page).last().locator(".row-main").click();
  await expect(page.locator(".image-row.selected").getByRole("button", { name: "删除", exact: true })).toBeInViewport({ ratio: 1 });
});

test("改名 edits the title in the row and keeps it to 40 characters", async ({ page }) => {
  await openImages(page);
  await addImages(page, PNG_FILE);
  await rows(page).first().locator(".row-main").click();
  await page.locator(".image-row.selected").getByRole("button", { name: "改名", exact: true }).click();
  const input = page.getByRole("textbox", { name: "图片标题", exact: true });
  await expect(input).toBeFocused();
  await input.fill("收款码".repeat(20));
  expect((await input.inputValue()).length).toBeLessThanOrEqual(40);
  await input.fill("微信收款码");
  await input.press("Enter");
  await expect(rows(page).first()).toContainText("微信收款码");
  await expect(rows(page).first()).not.toContainText("sample-gradient");
  await expect(page.locator(".toast")).toContainText("已改名");

  // Escape leaves the title as it was.
  await page.locator(".image-row.selected").getByRole("button", { name: "改名", exact: true }).click();
  await page.getByRole("textbox", { name: "图片标题", exact: true }).fill("不会保存");
  await page.getByRole("textbox", { name: "图片标题", exact: true }).press("Escape");
  await expect(rows(page).first()).toContainText("微信收款码");
});

test("the search box filters images by title", async ({ page }) => {
  await openImages(page);
  await addImages(page, [PNG_FILE, JPG_FILE]);
  await expect(rows(page)).toHaveCount(2);
  const search = page.getByPlaceholder("搜索图片标题");
  await search.fill("photo");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("sample-photo");
  await search.fill("没有这张");
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator("body")).toContainText("没有匹配的图片");
  await search.fill("");
  await expect(rows(page)).toHaveCount(2);
  // Enter in the search box must not copy a hidden text snippet.
  await search.press("Enter");
  expect(await page.evaluate(() => window.__copied)).toBeUndefined();
});

test("删除 moves the image to the 回收站 with an undo; 恢复 brings it back; 永久删除 asks first and removes only that one", async ({ page }) => {
  await openImages(page);
  await addImages(page, PNG_FILE);
  await rows(page).first().locator(".row-main").click();
  await page.locator(".image-row.selected").getByRole("button", { name: "删除", exact: true }).click();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.locator(".toast")).toContainText("图片已移入回收站");

  // 撤销 puts it back right away.
  await page.locator(".toast").getByRole("button", { name: "撤销" }).click();
  await expect(page.locator(".nav-footer .nav-item", { hasText: "回收站" })).toHaveText("回收站");
  await expect(page.locator(".nav-footer .nav-item", { hasText: "回收站" })).not.toContainText("1");

  // Delete again, then work from the 回收站.
  await rows(page).first().locator(".row-main").click();
  await page.locator(".image-row.selected").getByRole("button", { name: "删除", exact: true }).click();
  await expect(rows(page)).toHaveCount(0);
  const trashNav = page.locator(".nav-footer .nav-item", { hasText: "回收站" });
  await expect(trashNav).toContainText("1");
  await trashNav.click();
  await expect(page.locator(".trash-row")).toHaveCount(1);
  // It survives a reload.
  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await page.locator(".nav-footer .nav-item", { hasText: "回收站" }).click();
  await expect(page.locator(".trash-row")).toHaveCount(1);

  await page.locator(".trash-row").getByRole("button", { name: /^永久删除/ }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("永久删除这张图片？");
  await expect(dialog).toContainText("删除后无法恢复。");
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(page.locator(".trash-row")).toHaveCount(1);

  await page.locator(".trash-row").getByRole("button", { name: /^恢复/ }).click();
  await expect(page.locator(".trash-row")).toHaveCount(0);
  await expect(page.locator("body")).toContainText("回收站是空的");
  await page.locator(".sidebar .nav-item", { hasText: "全部图片" }).click();
  await expect(rows(page)).toHaveCount(1);

  // Permanent deletion: gone for good, also after a reload.
  await rows(page).first().locator(".row-main").click();
  await page.locator(".image-row.selected").getByRole("button", { name: "删除", exact: true }).click();
  await page.locator(".nav-footer .nav-item", { hasText: "回收站" }).click();
  await page.locator(".trash-row").getByRole("button", { name: /^永久删除/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "永久删除" }).click();
  await expect(page.locator(".trash-row")).toHaveCount(0);
  await expect(page.locator(".toast")).toContainText("已永久删除");
  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await expect(page.locator("body")).toContainText("还没有图片，先添加第一张");
  await page.locator(".nav-footer .nav-item", { hasText: "回收站" }).click();
  await expect(page.locator("body")).toContainText("回收站是空的");
});

test("永久删除 in the 回收站 removes only the chosen image, and trashed images are not counted or listed in the folders", async ({ page }) => {
  await openImages(page);
  const buffer = readFileSync(PNG_FILE);
  await addImages(page, ["甲", "乙", "丙"].map((name) => ({ name: `${name}.png`, mimeType: "image/png", buffer })));
  await expect(rows(page)).toHaveCount(3);
  for (const title of ["甲", "乙"]) {
    await rows(page).filter({ hasText: title }).locator(".row-main").click();
    await page.locator(".image-row.selected").getByRole("button", { name: "删除", exact: true }).click();
    await expect(rows(page).filter({ hasText: title })).toHaveCount(0);
  }
  await expect(page.locator(".sidebar .nav-item", { hasText: "全部图片" })).toContainText("1");
  await page.locator(".nav-footer .nav-item", { hasText: "回收站" }).click();
  await expect(page.locator(".trash-row")).toHaveCount(2);
  await page.locator(".trash-row", { hasText: "乙" }).getByRole("button", { name: /^永久删除/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "永久删除" }).click();
  await expect(page.locator(".trash-row")).toHaveCount(1);
  await expect(page.locator(".trash-row")).toContainText("甲");
  await page.locator(".trash-row").getByRole("button", { name: /^恢复/ }).click();
  await page.locator(".sidebar .nav-item", { hasText: "全部图片" }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).filter({ hasText: "乙" })).toHaveCount(0);
});

test("the 回收站 empties itself after the chosen days (7 by default); an image deleted today stays", async ({ page }) => {
  await openImages(page);
  const buffer = readFileSync(PNG_FILE);
  await addImages(page, ["旧", "新"].map((name) => ({ name: `${name}.png`, mimeType: "image/png", buffer })));
  await expect(rows(page)).toHaveCount(2);
  await rows(page).filter({ hasText: "旧" }).locator(".row-main").click();
  await page.locator(".image-row.selected").getByRole("button", { name: "删除", exact: true }).click();
  await expect(rows(page)).toHaveCount(1);

  // Eight days later (the page clock moves, the stored deletion time does not): the old one is removed for good.
  await page.clock.setFixedTime(new Date(Date.now() + 8 * 86_400_000));
  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await expect(rows(page)).toHaveCount(1);
  await page.locator(".nav-footer .nav-item", { hasText: "回收站" }).click();
  await expect(page.locator("body")).toContainText("回收站是空的");

  // An image deleted now is still there a day later.
  await page.locator(".sidebar .nav-item", { hasText: "全部图片" }).click();
  await rows(page).first().locator(".row-main").click();
  await page.locator(".image-row.selected").getByRole("button", { name: "删除", exact: true }).click();
  // The change is written to the store before the row goes away: reloading earlier would cut that write off.
  await expect(rows(page)).toHaveCount(0);
  await page.clock.setFixedTime(new Date(Date.now() + 9 * 86_400_000));
  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await page.locator(".nav-footer .nav-item", { hasText: "回收站" }).click();
  await expect(page.locator(".trash-row")).toHaveCount(1);
});

test("images survive a reload and the stored records do not reveal the title or the picture", async ({ page }) => {
  await openImages(page);
  const buffer = readFileSync(PNG_FILE);
  await addImages(page, { name: "收款二维码.png", mimeType: "image/png", buffer });
  await expect(rows(page).first()).toContainText("收款二维码");

  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("收款二维码");
  await expect.poll(() => page.locator(".image-thumb img").evaluate((img) => img.naturalWidth)).toBe(48);

  const raw = await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("clipbox-images");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(["meta", "blobs"]);
      const meta = tx.objectStore("meta").getAll();
      const blobs = tx.objectStore("blobs").getAll();
      tx.oncomplete = () => resolve({
        meta: JSON.stringify(meta.result),
        blobs: blobs.result.map((record) => ({ iv: record.iv, bytes: Array.from(new Uint8Array(record.ciphertext)) })),
      });
      tx.onerror = () => reject(tx.error);
    };
  }));
  expect(raw.meta).not.toContain("收款二维码");
  expect(raw.meta).not.toContain("image/png");
  expect(raw.blobs).toHaveLength(1);
  // The stored bytes are not the PNG: no signature at the start, and not the same length as plain data.
  expect(raw.blobs[0].bytes.slice(0, 4)).not.toEqual(PNG_SIGNATURE.slice(0, 4));
  expect(raw.blobs[0].bytes.length).toBe(buffer.length + 16);
});

test("a picture that is too big or not a supported type is refused in Chinese", async ({ page }) => {
  await openImages(page);
  await addImages(page, { name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"/>") });
  await expect(page.locator(".toast")).toContainText("只支持 PNG、JPG、WebP、GIF 图片");
  await expect(rows(page)).toHaveCount(0);

  await addImages(page, { name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(11 * 1024 * 1024) });
  await expect(page.locator(".toast")).toContainText("图片太大，最多 10 MB");
  await expect(rows(page)).toHaveCount(0);
});

test("a file that claims to be a PNG but cannot be opened is refused without adding a row", async ({ page }) => {
  await openImages(page);
  await addImages(page, { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not really a picture") });
  await expect(page.locator(".toast")).toContainText("这张图片打不开");
  await expect(rows(page)).toHaveCount(0);
});

test("pasting an image adds it with a date title, but pasting text into the search box does not", async ({ page }) => {
  await openImages(page);
  const base64 = readFileSync(PNG_FILE).toString("base64");
  await page.evaluate((data) => {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "image.png", { type: "image/png" }));
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, base64);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(/图片 \d{2}-\d{2} \d{2}:\d{2}/);

  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "只是文字");
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(200);
  await expect(rows(page)).toHaveCount(1);
});

test("dropping image files on the panel adds them", async ({ page }) => {
  await openImages(page);
  const base64 = readFileSync(JPG_FILE).toString("base64");
  const transfer = await page.evaluateHandle((data) => {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "拖进来的图.jpg", { type: "image/jpeg" }));
    return dt;
  }, base64);
  await page.locator(".image-section").dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(page.locator(".image-drop-hint")).toBeVisible();
  await page.locator(".image-section").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("拖进来的图");
  await expect(page.locator(".image-drop-hint")).toHaveCount(0);
});

test("no keyboard shortcut is advertised on the 图片 page", async ({ page }) => {
  await openImages(page);
  await addImages(page, PNG_FILE);
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator("kbd")).toHaveCount(0);
  await expect(page.locator(".content-panel")).not.toContainText(/Ctrl|⌘|快捷键/);
});

test("the mini window lists images and copies with one click", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 680, height: 620 }, locale: "zh-CN" });
  const page = await context.newPage();
  await openImages(page);
  await addImages(page, [PNG_FILE, JPG_FILE]);
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole("button", { name: "迷你模式" }).click();
  await page.setViewportSize({ width: 360, height: 440 });
  await expect(page.locator(".kind-switch.compact button")).toHaveText(["话术", "图片", "账号"]);
  await expect(page.locator(".kind-switch.compact button.active")).toHaveText("图片");
  await expect(page.locator(".mini-row")).toHaveCount(2);
  await page.getByPlaceholder("搜索图片").fill("photo");
  await expect(page.locator(".mini-row")).toHaveCount(1);
  await page.getByRole("button", { name: "复制 sample-photo" }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedImage)).toEqual(PNG_SIGNATURE);
  await expect(page.locator(".status-bar")).toContainText("1 张");
  await context.close();
});

test("a copy that fails says so and leaves the image alone", async ({ page }) => {
  await openImages(page);
  await addImages(page, PNG_FILE);
  await expect(rows(page)).toHaveCount(1);
  await page.evaluate(() => { window.clipboxDesktop.copyImage = async () => { throw new Error("denied"); }; });
  await page.getByRole("button", { name: "复制 sample-gradient" }).click();
  await expect(page.locator(".toast")).toContainText("图片复制失败，请重试");
  await expect(rows(page)).toHaveCount(1);
});

// 图片 are shrunk with TinyPNG before they are stored (D-037): at most 100 a month, never losing the picture.
async function withCompressor(page, behaviour) {
  await page.addInitScript((mode) => {
    window.__compressCalls = 0;
    const desktop = () => window.clipboxDesktop;
    Object.defineProperty(window, "__installCompressor", { value: () => {
      desktop().compressImage = async () => {
        window.__compressCalls += 1;
        if (mode === "fail") return { ok: false, reason: "network" };
        // a real, much smaller picture (a 1×1 PNG)
        return { ok: true, bytes: Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0)) };
      };
    } });
    document.addEventListener("DOMContentLoaded", () => window.__installCompressor());
  }, behaviour);
}

test("a new picture is compressed, the saving is shown, and 设置 counts it", async ({ page }) => {
  await asDesktop(page, "win32", { imageView: "list" });
  await withCompressor(page, "ok");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await addImages(page, PNG_FILE);
  await expect(page.locator(".toast")).toContainText(/已压缩 .* → /);
  await expect(rows(page)).toHaveCount(1);
  expect(await page.evaluate(() => window.__compressCalls)).toBe(1);
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.locator(".settings-dialog").getByRole("tab", { name: "数据" }).click();
  await expect(page.locator(".settings-dialog")).toContainText("1 / 100 张");
});

test("when the compression service cannot be reached the original picture is still saved, and the user is told", async ({ page }) => {
  await asDesktop(page, "win32", { imageView: "list" });
  await withCompressor(page, "fail");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await addImages(page, PNG_FILE);
  await expect(page.locator(".toast")).toContainText("没有连上压缩服务，已保存原图");
  await expect(rows(page)).toHaveCount(1);
});

test("after 100 compressed pictures in a month, adding another is refused with a clear message", async ({ page }) => {
  await asDesktop(page, "win32", { imageView: "list" });
  await withCompressor(page, "ok");
  await page.addInitScript(() => {
    const now = new Date();
    localStorage.setItem("clipbox.tinify.usage.v1", JSON.stringify({ month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, count: 100 }));
  });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await addImages(page, PNG_FILE);
  await expect(page.locator(".toast")).toContainText("本月图片压缩次数已用完（100/100）");
  await expect(rows(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__compressCalls)).toBe(0);
});

test("in the list view 选择 shows a tick box on each row and 删除 moves the ticked pictures to the 回收站", async ({ page }) => {
  await openImages(page);
  await addImages(page, [PNG_FILE, JPG_FILE]);
  await expect(rows(page)).toHaveCount(2);
  await rows(page).first().locator(".row-main").click();
  await expect(page.getByRole("button", { name: "收起展开的图片" })).toBeVisible();
  await page.getByRole("button", { name: "选择", exact: true }).click();
  await expect(page.locator(".image-row.selected")).toHaveCount(0);
  await expect(page.locator(".row-check")).toHaveCount(2);
  await page.locator(".row-check").first().click();
  await expect(page.getByText("已选 1 张")).toBeVisible();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator(".toast")).toContainText("图片已移入回收站");
});
