import { expect, test } from "@playwright/test";
import { makePng } from "../helpers/png.mjs";
import { asDesktop } from "./helpers.mjs";

// The 图片 folders (docs/specs/image-folders.md). Every picture is generated here, so no binary fixtures are needed.
const png = (name, width = 40, height = 40, color = [90, 140, 220]) => ({ name: `${name}.png`, mimeType: "image/png", buffer: makePng(width, height, color) });

async function openImages(page, platform = "win32") {
  await asDesktop(page, platform, { imageView: "list" });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
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

const sidebar = (page) => page.locator(".sidebar");
const rows = (page) => page.locator(".image-row");
const navCount = (page, label) => sidebar(page).locator(".nav-item", { hasText: label }).locator("b");
const folderRow = (page, name) => sidebar(page).locator(".directory-row", { hasText: name });
const title = (page) => page.locator(".section-head h1");

async function createFolder(page, name) {
  await page.getByRole("button", { name: "新建目录" }).click();
  const input = page.getByRole("textbox", { name: "新目录名称" });
  await input.fill(name);
  await input.press("Enter");
  await expect(folderRow(page, name)).toBeVisible();
}

async function openFolderMenu(page, name) {
  await folderRow(page, name).hover();
  await page.getByRole("button", { name: `管理目录 ${name}` }).click();
  return page.getByRole("menu", { name: `管理目录 ${name}` });
}

async function reloadToImages(page) {
  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await expect(page.locator(".image-section")).toBeVisible();
}

test("the 图片 sidebar lists 全部图片, 目录 with a + button, and 未分类, and no 话术 shortcuts", async ({ page }) => {
  await openImages(page);
  await expect(sidebar(page).locator(".nav-item", { hasText: "全部图片" })).toHaveClass(/active/);
  await expect(sidebar(page).locator(".nav-heading")).toContainText("目录");
  await expect(page.getByRole("button", { name: "新建目录" })).toBeVisible();
  await expect(sidebar(page).locator(".nav-item", { hasText: "未分类" })).toBeVisible();
  await expect(navCount(page, "全部图片")).toHaveText("0");
  await expect(navCount(page, "未分类")).toHaveText("0");
  await expect(sidebar(page).getByRole("button", { name: "设置" })).toBeVisible();
  await expect(sidebar(page).locator(".nav-footer").getByRole("button", { name: /回收站/ })).toBeVisible();
  await expect(sidebar(page)).not.toContainText("最近");
});

test("a new folder: Enter creates it, Esc cancels, empty and repeated names are refused", async ({ page }) => {
  await openImages(page);
  const input = page.getByRole("textbox", { name: "新目录名称" });

  await page.getByRole("button", { name: "新建目录" }).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("placeholder", "目录名称");
  await input.fill("不会保存");
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(folderRow(page, "不会保存")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "新建目录" })).toBeFocused();

  await page.getByRole("button", { name: "新建目录" }).click();
  await input.press("Enter");
  await expect(page.locator(".toast")).toContainText("目录名不能为空");
  await expect(input).toBeVisible();
  await input.fill("收款码");
  await input.press("Enter");
  await expect(input).toHaveCount(0);
  await expect(page.locator(".toast")).toContainText("目录已创建");
  await expect(folderRow(page, "收款码")).toHaveClass(/active/);
  await expect(title(page)).toHaveText("收款码");
  await expect(navCount(page, "收款码")).toHaveText("0");

  await page.getByRole("button", { name: "新建目录" }).click();
  await input.fill("收款码");
  await input.press("Enter");
  await expect(page.locator(".toast")).toContainText("目录名已存在");
  await expect(input).toBeVisible();
  await expect(folderRow(page, "收款码")).toHaveCount(1);
  // Upper and lower case count as the same name.
  await input.fill("Price");
  await input.press("Enter");
  await expect(folderRow(page, "Price")).toBeVisible();
  await page.getByRole("button", { name: "新建目录" }).click();
  await input.fill("price");
  await input.press("Enter");
  await expect(page.locator(".toast")).toContainText("目录名已存在");
  await input.press("Escape");
  await expect(sidebar(page).locator(".directory-row")).toHaveCount(3); // 收款码, Price, 未分类
});

test("a folder name is at most 20 characters", async ({ page }) => {
  await openImages(page);
  await page.getByRole("button", { name: "新建目录" }).click();
  const input = page.getByRole("textbox", { name: "新目录名称" });
  await input.fill("很长的目录名".repeat(6));
  expect((await input.inputValue()).length).toBeLessThanOrEqual(20);
});

test("adding images while a folder is open puts them in it; 全部图片 and 未分类 add up", async ({ page }) => {
  await openImages(page);
  await createFolder(page, "收款码");
  await addImages(page, [png("码一"), png("码二")]);
  await expect(rows(page)).toHaveCount(2);
  await expect(navCount(page, "收款码")).toHaveText("2");
  await expect(navCount(page, "全部图片")).toHaveText("2");
  await expect(navCount(page, "未分类")).toHaveText("0");
  await expect(page.locator(".section-count")).toHaveText("2");

  await sidebar(page).locator(".nav-item", { hasText: "全部图片" }).click();
  await expect(title(page)).toHaveText("全部图片");
  await addImages(page, png("散图"));
  await expect(rows(page)).toHaveCount(3);
  await expect(navCount(page, "全部图片")).toHaveText("3");
  await expect(navCount(page, "收款码")).toHaveText("2");
  await expect(navCount(page, "未分类")).toHaveText("1");

  await sidebar(page).locator(".nav-item", { hasText: "未分类" }).click();
  await expect(title(page)).toHaveText("未分类");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("散图");
  // 未分类 adds into 未分类.
  await addImages(page, png("又一张"));
  await expect(rows(page)).toHaveCount(2);
  await expect(navCount(page, "未分类")).toHaveText("2");
});

test("selecting a folder filters the list and an empty folder says so", async ({ page }) => {
  await openImages(page);
  await createFolder(page, "收款码");
  await createFolder(page, "价目表");
  await addImages(page, png("价目一"));
  await sidebar(page).locator(".nav-item", { hasText: "收款码" }).click();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator(".image-section")).toContainText("这个目录还是空的");
  await expect(page.locator(".image-section")).toContainText("点右上角的「新增图片」，会放进这个目录");
  await addImages(page, [png("码一"), png("码二")]);
  await expect(rows(page)).toHaveCount(2);

  await sidebar(page).locator(".nav-item", { hasText: "价目表" }).click();
  await expect(title(page)).toHaveText("价目表");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("价目一");

  await sidebar(page).locator(".nav-item", { hasText: "全部图片" }).click();
  await expect(rows(page)).toHaveCount(3);
  // Search works inside the open folder.
  await sidebar(page).locator(".nav-item", { hasText: "收款码" }).click();
  await page.getByPlaceholder("搜索图片标题").fill("码二");
  await expect(rows(page)).toHaveCount(1);
  await page.getByPlaceholder("搜索图片标题").fill("价目一");
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator(".image-section")).toContainText("没有匹配的图片");
});

test("move an image from the row's ⋯ menu and from the 目录 line of the open image", async ({ page }) => {
  await openImages(page);
  await createFolder(page, "收款码");
  await createFolder(page, "价目表");
  await sidebar(page).locator(".nav-item", { hasText: "全部图片" }).click();
  await addImages(page, [png("图甲"), png("图乙")]);
  await expect(rows(page)).toHaveCount(2);
  await expect(navCount(page, "未分类")).toHaveText("2");

  // Row menu.
  await rows(page).filter({ hasText: "图甲" }).locator(".row-main").click();
  const open = page.locator(".image-row.selected");
  await expect(open.locator(".image-folder-button")).toContainText("未分类");
  await open.getByRole("button", { name: "更多操作 图甲" }).click();
  const menu = page.getByRole("menu", { name: "移动到" });
  await expect(menu.getByRole("menuitem")).toHaveText(["收款码", "价目表"]);
  await menu.getByRole("menuitem", { name: "收款码" }).click();
  await expect(page.locator(".toast")).toContainText("已移到「收款码」");
  await expect(menu).toHaveCount(0);
  await expect(navCount(page, "收款码")).toHaveText("1");
  await expect(navCount(page, "未分类")).toHaveText("1");
  await expect(page.locator(".image-row.selected .image-folder-button")).toContainText("收款码");

  // The current folder is not offered again, 未分类 is.
  await page.locator(".image-row.selected").getByRole("button", { name: "更多操作 图甲" }).click();
  await expect(page.getByRole("menu", { name: "移动到" }).getByRole("menuitem")).toHaveText(["价目表", "未分类"]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "移动到" })).toHaveCount(0);

  // The 目录 line of the open image opens the same menu.
  await rows(page).filter({ hasText: "图乙" }).locator(".row-main").click();
  await page.locator(".image-row.selected .image-folder-button").click();
  await page.getByRole("menu", { name: "移动到" }).getByRole("menuitem", { name: "价目表" }).click();
  await expect(page.locator(".toast")).toContainText("已移到「价目表」");
  await expect(navCount(page, "价目表")).toHaveText("1");
  await expect(navCount(page, "未分类")).toHaveText("0");

  // Back to 未分类 from inside a folder: the image leaves the list.
  await sidebar(page).locator(".nav-item", { hasText: "价目表" }).click();
  await expect(rows(page)).toHaveCount(1);
  // The image that was open stays open when its folder is shown.
  await expect(page.locator(".image-row.selected")).toContainText("图乙");
  await page.locator(".image-row.selected .image-folder-button").click();
  await page.getByRole("menu", { name: "移动到" }).getByRole("menuitem", { name: "未分类" }).click();
  await expect(page.locator(".toast")).toContainText("已移到未分类");
  await expect(rows(page)).toHaveCount(0);
  await expect(navCount(page, "未分类")).toHaveText("1");
});

test("renaming a folder keeps its images and the folder open; a taken name is refused", async ({ page }) => {
  await openImages(page);
  await createFolder(page, "收款码");
  await createFolder(page, "价目表");
  await sidebar(page).locator(".nav-item", { hasText: "收款码" }).click();
  await addImages(page, [png("码一"), png("码二")]);
  await expect(rows(page)).toHaveCount(2);

  const menu = await openFolderMenu(page, "收款码");
  await menu.getByRole("menuitem", { name: "重命名" }).click();
  const input = page.getByRole("textbox", { name: "重命名 收款码" });
  await expect(input).toBeFocused();
  await input.fill("价目表");
  await input.press("Enter");
  await expect(page.locator(".toast")).toContainText("目录名已存在");
  await expect(input).toBeVisible();
  await input.fill("付款码");
  await input.press("Enter");
  await expect(page.locator(".toast")).toContainText("目录已重命名");
  await expect(folderRow(page, "收款码")).toHaveCount(0);
  await expect(folderRow(page, "付款码")).toHaveClass(/active/);
  await expect(title(page)).toHaveText("付款码");
  await expect(navCount(page, "付款码")).toHaveText("2");
  await expect(rows(page)).toHaveCount(2);

  // Esc leaves the name alone.
  const again = await openFolderMenu(page, "付款码");
  await again.getByRole("menuitem", { name: "重命名" }).click();
  await page.getByRole("textbox", { name: "重命名 付款码" }).fill("不会保存");
  await page.getByRole("textbox", { name: "重命名 付款码" }).press("Escape");
  await expect(folderRow(page, "付款码")).toBeVisible();

  await reloadToImages(page);
  await expect(folderRow(page, "付款码")).toBeVisible();
  await expect(navCount(page, "付款码")).toHaveText("2");
});

test("a folder gets the automatic colour, and the 颜色 menu recolours it for good", async ({ page }) => {
  await openImages(page);
  await createFolder(page, "收款码");
  const dot = folderRow(page, "收款码").locator(".directory-color-marker");
  const before = await dot.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(before).not.toBe("rgba(0, 0, 0, 0)");

  const menu = await openFolderMenu(page, "收款码");
  await expect(menu.getByRole("group", { name: "目录颜色" }).getByRole("button")).toHaveCount(20);
  await menu.getByRole("button", { name: "颜色 #4DBFC4" }).click();
  await expect(page.locator(".toast")).toContainText("颜色已更新");
  await expect(dot).toHaveCSS("background-color", "rgb(77, 191, 196)");

  await reloadToImages(page);
  await expect(folderRow(page, "收款码").locator(".directory-color-marker")).toHaveCSS("background-color", "rgb(77, 191, 196)");
  const reopened = await openFolderMenu(page, "收款码");
  await expect(reopened.getByRole("button", { name: "颜色 #4DBFC4" })).toHaveAttribute("aria-pressed", "true");
});

test("deleting a folder asks twice, moves its images to 未分类 and loses none", async ({ page }) => {
  await openImages(page);
  await createFolder(page, "收款码");
  await createFolder(page, "价目表");
  await sidebar(page).locator(".nav-item", { hasText: "收款码" }).click();
  await addImages(page, [png("码一"), png("码二")]);
  await expect(rows(page)).toHaveCount(2);
  await sidebar(page).locator(".nav-item", { hasText: "价目表" }).click();
  await addImages(page, png("价目一"));
  await expect(navCount(page, "全部图片")).toHaveText("3");

  await sidebar(page).locator(".nav-item", { hasText: "收款码" }).click();
  const menu = await openFolderMenu(page, "收款码");
  await menu.getByRole("menuitem", { name: "删除目录…" }).click();
  // The second step names what happens to the images; nothing is deleted yet.
  await expect(menu.getByRole("menuitem", { name: "确认删除，2 张移到未分类" })).toBeVisible();
  await expect(folderRow(page, "收款码")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(folderRow(page, "收款码")).toHaveCount(1);

  const again = await openFolderMenu(page, "收款码");
  await expect(again.getByRole("menuitem", { name: "删除目录…" })).toBeVisible();
  await again.getByRole("menuitem", { name: "删除目录…" }).click();
  await again.getByRole("menuitem", { name: "确认删除，2 张移到未分类" }).click();
  await expect(page.locator(".toast")).toContainText("已删除目录「收款码」");
  await expect(folderRow(page, "收款码")).toHaveCount(0);
  // The deleted folder was open: the list falls back to 全部图片 and still has every image.
  await expect(title(page)).toHaveText("全部图片");
  await expect(rows(page)).toHaveCount(3);
  await expect(navCount(page, "全部图片")).toHaveText("3");
  await expect(navCount(page, "未分类")).toHaveText("2");
  await expect(navCount(page, "价目表")).toHaveText("1");

  await reloadToImages(page);
  await expect(folderRow(page, "收款码")).toHaveCount(0);
  await expect(navCount(page, "未分类")).toHaveText("2");
  await expect(rows(page)).toHaveCount(3);
});

test("an empty folder is deleted with a plain 确认删除", async ({ page }) => {
  await openImages(page);
  await createFolder(page, "空目录");
  const menu = await openFolderMenu(page, "空目录");
  await menu.getByRole("menuitem", { name: "删除目录…" }).click();
  await menu.getByRole("menuitem", { name: "确认删除", exact: true }).click();
  await expect(folderRow(page, "空目录")).toHaveCount(0);
});

test("at most 30 folders", async ({ page }) => {
  await openImages(page);
  for (let index = 1; index <= 30; index += 1) {
    await page.getByRole("button", { name: "新建目录" }).click();
    const input = page.getByRole("textbox", { name: "新目录名称" });
    await input.fill(`目录${index}`);
    await input.press("Enter");
    await expect(input).toHaveCount(0);
  }
  await expect(sidebar(page).locator(".directory-row")).toHaveCount(31);
  await page.getByRole("button", { name: "新建目录" }).click();
  await page.getByRole("textbox", { name: "新目录名称" }).fill("目录31");
  await page.getByRole("textbox", { name: "新目录名称" }).press("Enter");
  await expect(page.locator(".toast")).toContainText("目录最多 30 个");
  await expect(sidebar(page).locator(".directory-row")).toHaveCount(31);
});

test("folders and assignments survive a reload, and the stored records do not reveal a folder name", async ({ page }) => {
  await openImages(page);
  await createFolder(page, "绝密收款目录");
  await createFolder(page, "价目表");
  await sidebar(page).locator(".nav-item", { hasText: "绝密收款目录" }).click();
  await addImages(page, [png("码一"), png("码二")]);
  await expect(rows(page)).toHaveCount(2);
  await sidebar(page).locator(".nav-item", { hasText: "全部图片" }).click();
  await addImages(page, png("散图"));
  await expect(rows(page)).toHaveCount(3);

  await reloadToImages(page);
  await expect(folderRow(page, "绝密收款目录")).toBeVisible();
  await expect(folderRow(page, "价目表")).toBeVisible();
  await expect(navCount(page, "绝密收款目录")).toHaveText("2");
  await expect(navCount(page, "价目表")).toHaveText("0");
  await expect(navCount(page, "未分类")).toHaveText("1");
  await expect(navCount(page, "全部图片")).toHaveText("3");
  await sidebar(page).locator(".nav-item", { hasText: "绝密收款目录" }).click();
  await expect(rows(page)).toHaveCount(2);

  const raw = await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("clipbox-images");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(["meta", "blobs"]);
      const meta = tx.objectStore("meta").getAll();
      const blobs = tx.objectStore("blobs").getAll();
      tx.oncomplete = () => resolve({ meta: JSON.stringify(meta.result), blobCount: blobs.result.length });
      tx.onerror = () => reject(tx.error);
    };
  }));
  expect(raw.blobCount).toBe(3);
  // The folder list is one more encrypted record; neither it nor an image record shows a name.
  expect(raw.meta).toContain("\"id\":\"folders\"");
  expect(raw.meta).not.toContain("\"folder\":");
  for (const secret of ["绝密收款目录", "价目表", "码一"]) expect(raw.meta).not.toContain(secret);
});

test("the open folder is kept when switching to 话术 and back", async ({ page }) => {
  await openImages(page);
  await createFolder(page, "收款码");
  await createFolder(page, "价目表");
  await sidebar(page).locator(".nav-item", { hasText: "收款码" }).click();
  await page.locator(".kind-switch").getByRole("button", { name: "话术" }).click();
  await expect(sidebar(page)).not.toContainText("收款码");
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await expect(folderRow(page, "收款码")).toHaveClass(/active/);
  await expect(title(page)).toHaveText("收款码");
});

test("wide, tall, tiny and large pictures stay inside the panel", async ({ page }) => {
  await openImages(page);
  const cases = [
    { name: "横幅", width: 1920, height: 480 },
    { name: "长图", width: 300, height: 3000 },
    { name: "小图标", width: 128, height: 128 },
    { name: "大图", width: 3000, height: 2000 },
  ];
  await addImages(page, cases.map(({ name, width, height }) => ({ name: `${name}.png`, mimeType: "image/png", buffer: makePng(width, height, [70, 130, 200], { frame: [230, 90, 60] }) })));
  await expect(rows(page)).toHaveCount(4);
  await expect.poll(() => page.locator(".image-thumb img").count()).toBe(4);

  // Thumbnails are squares that show the whole picture (never cropped).
  for (const thumb of await page.locator(".image-thumb").all()) {
    const box = await thumb.boundingBox();
    expect(Math.abs(box.width - box.height)).toBeLessThan(0.5); // sub-pixel noise while the row slides in
    await expect(thumb.locator("img")).toHaveCSS("object-fit", "contain");
  }

  for (const { name, width, height } of cases) {
    await rows(page).filter({ hasText: name }).locator(".row-main").click();
    const open = page.locator(".image-row.selected");
    await expect(open).toContainText(name);
    const preview = open.locator(".image-preview");
    const image = preview.locator("img");
    await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth), { message: name }).toBe(width);
    await expect.poll(() => image.evaluate((element) => element.naturalHeight)).toBe(height);
    await expect(image).toHaveCSS("object-fit", "contain");
    await page.waitForTimeout(350); // Let the row finish opening.

    const panel = await page.locator(".content-panel").boundingBox();
    const box = await preview.boundingBox();
    const shown = await image.boundingBox();
    expect(box.x, name).toBeGreaterThanOrEqual(panel.x);
    expect(box.x + box.width, name).toBeLessThanOrEqual(panel.x + panel.width);
    expect(box.height, name).toBeLessThanOrEqual(260);
    expect(shown.x, name).toBeGreaterThanOrEqual(box.x - 0.5);
    expect(shown.x + shown.width, name).toBeLessThanOrEqual(box.x + box.width + 0.5);
    expect(shown.y, name).toBeGreaterThanOrEqual(box.y - 0.5);
    expect(shown.y + shown.height, name).toBeLessThanOrEqual(box.y + box.height + 0.5);
    // The whole picture is shown: its shape is the shape of the file.
    expect(shown.width / shown.height, name).toBeCloseTo(width / height, 1);
    const overflow = await page.evaluate(() => {
      const list = document.querySelector(".image-list");
      return { list: list.scrollWidth - list.clientWidth, page: document.documentElement.scrollWidth - window.innerWidth };
    });
    expect(overflow.list, name).toBeLessThanOrEqual(0);
    expect(overflow.page, name).toBeLessThanOrEqual(0);
    // The buttons below the picture are still there.
    await expect(open.getByRole("button", { name: "删除", exact: true })).toBeVisible();
    await open.locator(".row-main").click();
    await expect(page.locator(".image-row.selected")).toHaveCount(0);
  }
});

test("the mini window has a folder select next to the search box", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 680, height: 620 }, locale: "zh-CN" });
  const page = await context.newPage();
  await openImages(page);
  await createFolder(page, "收款码");
  await createFolder(page, "价目表");
  await sidebar(page).locator(".nav-item", { hasText: "收款码" }).click();
  await addImages(page, [png("码一"), png("码二")]);
  await sidebar(page).locator(".nav-item", { hasText: "价目表" }).click();
  await addImages(page, png("价目一"));
  await sidebar(page).locator(".nav-item", { hasText: "全部图片" }).click();
  await addImages(page, png("散图"));
  await expect(rows(page)).toHaveCount(4);

  await page.getByRole("button", { name: "迷你模式" }).click();
  await page.setViewportSize({ width: 360, height: 440 });
  const select = page.locator(".mini-folder select");
  await expect(select).toBeVisible();
  await expect(select.locator("option")).toHaveText(["全部", "收藏", "收款码", "价目表", "未分类"]);
  await expect(page.locator(".mini-row")).toHaveCount(4);
  await expect(page.locator(".status-bar")).toContainText("4 张");

  await select.selectOption({ label: "收款码" });
  await expect(page.locator(".mini-row")).toHaveCount(2);
  await expect(page.locator(".status-bar")).toContainText("2 张");
  await select.selectOption({ label: "未分类" });
  await expect(page.locator(".mini-row")).toHaveCount(1);
  await expect(page.locator(".mini-row").first()).toContainText("散图");
  await select.selectOption({ label: "价目表" });
  await page.getByPlaceholder("搜索图片").fill("码一");
  await expect(page.locator(".mini-row")).toHaveCount(0);
  await page.getByPlaceholder("搜索图片").fill("");
  await select.selectOption({ label: "全部" });
  await expect(page.locator(".mini-row")).toHaveCount(4);

  // Copying still works with one click, and an empty folder says so.
  await page.getByRole("button", { name: "复制 散图" }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedImage)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  await context.close();
});

test("the 话术 mini window keeps its own folder select", async ({ page }) => {
  await asDesktop(page, "win32");
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.getByRole("button", { name: "迷你模式" }).click();
  await page.setViewportSize({ width: 360, height: 440 });
  await expect(page.locator(".mini-folder select option")).toContainText(["全部", "收藏", "最近使用"]);
  await page.locator(".kind-switch.compact").getByRole("button", { name: "图片" }).click();
  await expect(page.locator(".mini-folder select option")).toHaveText(["全部", "收藏", "未分类"]);
});

test("macOS: 图片 has the same folder sidebar while 话术 and 账号 keep theirs", async ({ page }) => {
  await openImages(page, "darwin");
  await expect(page.locator(".kind-switch button")).toHaveText(["话术", "账号", "图片"]);
  await expect(navCount(page, "全部图片")).toHaveText("0");
  await expect(sidebar(page).locator(".nav-item", { hasText: "未分类" })).toBeVisible();
  await createFolder(page, "收款码");
  await addImages(page, png("码一"));
  await expect(rows(page)).toHaveCount(1);
  await expect(navCount(page, "收款码")).toHaveText("1");
  await expect(sidebar(page).locator(".nav-footer").getByRole("button", { name: /回收站/ })).toBeVisible();

  await page.locator(".kind-switch").getByRole("button", { name: "话术" }).click();
  await expect(sidebar(page)).toContainText("收藏");
  await expect(sidebar(page)).toContainText("最近");
  await expect(sidebar(page)).toContainText("回收站");
  await expect(sidebar(page)).not.toContainText("全部图片");
  await expect(sidebar(page)).not.toContainText("收款码");

  await page.locator(".kind-switch").getByRole("button", { name: "账号" }).click();
  await expect(sidebar(page)).toContainText("未分类");
  await expect(sidebar(page)).toContainText("回收站");
  await expect(sidebar(page)).not.toContainText("全部图片");
  await expect(sidebar(page)).not.toContainText("收款码");

  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await expect(folderRow(page, "收款码")).toHaveClass(/active/);
  await expect(rows(page)).toHaveCount(1);
});

test("全部图片 is not cut off in the sidebar once there are ten or more images", async ({ page }) => {
  await openImages(page);
  await addImages(page, Array.from({ length: 12 }, (_, index) => png(`图 ${index + 1}`, 20 + index, 20)));
  await expect(navCount(page, "全部图片")).toHaveText("12");
  const label = sidebar(page).locator(".nav-item", { hasText: "全部图片" }).locator(".nav-label");
  const fits = await label.evaluate((element) => element.scrollWidth <= element.clientWidth);
  expect(fits).toBe(true);
});

test("图片 folders can be dragged by the three-bar handle in the sidebar, and Settings shows the same order", async ({ page }) => {
  await openImages(page);
  for (const name of ["甲", "乙", "丙"]) await createFolder(page, name);
  const names = () => sidebar(page).locator(".directory-row .directory-main").evaluateAll((els) => els.map((el) => el.getAttribute("title")).filter(Boolean));
  expect(await names()).toEqual(["甲", "乙", "丙"]);
  const row = (name) => sidebar(page).locator(".directory-row", { hasText: name });
  await row("甲").hover();
  const handle = row("甲").locator(".folder-drag-handle");
  await expect(handle).toHaveCSS("opacity", "1");
  const h = await handle.boundingBox();
  const target = await row("丙").boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y + 20, { steps: 4 });
  await page.mouse.move(h.x + h.width / 2, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(names).toEqual(["乙", "丙", "甲"]);

  // The order is saved: it survives a reload, and Settings lists the same order and can move a folder too.
  await reloadToImages(page);
  await expect.poll(names).toEqual(["乙", "丙", "甲"]);
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.locator(".settings-dialog").getByRole("tab", { name: "目录" }).click();
  const group = page.locator(".settings-dialog .settings-folder-group", { hasText: "图片目录" });
  await group.getByRole("button", { name: /图片目录/ }).click();
  const settingsNames = () => group.locator(".settings-folder-name").allInnerTexts();
  expect(await settingsNames()).toEqual(["乙", "丙", "甲"]);
  await group.locator(".settings-folder", { hasText: "甲" }).getByRole("button", { name: /上移/ }).click();
  await expect.poll(settingsNames).toEqual(["乙", "甲", "丙"]);
  await page.keyboard.press("Escape");
  await expect.poll(names).toEqual(["乙", "甲", "丙"]);
});
