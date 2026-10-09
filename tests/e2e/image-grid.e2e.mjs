import { expect, test } from "@playwright/test";
import { makePng } from "../helpers/png.mjs";
import { asDesktop } from "./helpers.mjs";

// The 图片 nine-grid (docs/specs/image-grid.md). Every picture is generated here, so no binary fixtures are needed.
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const png = (name, width = 64, height = 64, color = [90, 140, 220], options) => ({ name: `${name}.png`, mimeType: "image/png", buffer: makePng(width, height, color, options) });

async function openImages(page, platform = "win32") {
  await asDesktop(page, platform); // no list override: the default view is the grid
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

const tiles = (page) => page.locator(".image-section:not(.compact) .image-tile");
const tile = (page, title) => page.locator(".image-tile", { has: page.getByRole("button", { name: new RegExp(`^(展开|已展开) ${title}$`) }) });
const card = (page) => page.locator(".image-card");
const sidebar = (page) => page.locator(".sidebar");

async function boxes(locator) {
  const result = [];
  for (let index = 0; index < (await locator.count()); index += 1) result.push(await locator.nth(index).boundingBox());
  return result;
}

async function addSix(page, names = ["图一", "图二", "图三", "图四", "图五", "图六"]) {
  await addImages(page, names.map((name, index) => png(name, 64, 64, [60 + index * 25, 140, 200 - index * 20])));
  await expect(tiles(page)).toHaveCount(names.length);
  await expect.poll(() => page.locator(".image-tile-thumb img").evaluateAll((images) => images.every((img) => img.naturalWidth > 0))).toBe(true);
}

test("the default view is a grid of square tiles, four to a row (16 tiles = 4 full rows)", async ({ page }) => {
  await openImages(page);
  await addSix(page);
  await expect(page.locator(".image-grid")).toBeVisible();
  await expect(page.locator(".image-row")).toHaveCount(0);
  const all = await boxes(tiles(page));
  expect(all[0].y).toBeCloseTo(all[1].y, 0);
  expect(all[1].y).toBeCloseTo(all[2].y, 0);
  expect(all[2].y).toBeCloseTo(all[3].y, 0);
  expect(all[4].y).toBeGreaterThan(all[0].y + all[0].width * 0.9);
  expect(all[4].y).toBeCloseTo(all[5].y, 0);
  expect(all[0].x).toBeLessThan(all[1].x);
  expect(all[2].x).toBeLessThan(all[3].x);
  expect(all[4].x).toBeCloseTo(all[0].x, 0);
  expect(all[1].width).toBeCloseTo(all[0].width, 0);
  expect(all[3].width).toBeCloseTo(all[0].width, 0);
  const thumbs = await boxes(page.locator(".image-tile-thumb"));
  for (const thumb of thumbs) expect(Math.abs(thumb.width - thumb.height)).toBeLessThan(1.5);
  // The title sits under the picture on one line.
  const title = await tiles(page).first().locator(".image-tile-title").boundingBox();
  expect(title.y).toBeGreaterThan(thumbs[0].y + thumbs[0].height - 1);
  await expect(page.locator(".section-count")).toHaveText("6");
});

test("the copy button on a tile puts a PNG on the clipboard", async ({ page }) => {
  await openImages(page);
  await addSix(page);
  const first = tile(page, "图一");
  const copy = first.getByRole("button", { name: "复制 图一" });
  await expect(copy).toBeVisible();
  // Always visible, but not at full strength until hovered or focused.
  expect(Number(await copy.evaluate((button) => getComputedStyle(button).opacity))).toBeGreaterThan(0.5);
  const corner = await copy.boundingBox();
  const box = await first.locator(".image-tile-thumb").boundingBox();
  expect(corner.x + corner.width).toBeGreaterThan(box.x + box.width - 14);
  expect(corner.y).toBeLessThan(box.y + 14);
  await copy.click();
  await expect.poll(() => page.evaluate(() => window.__copiedImage)).toEqual(PNG_SIGNATURE);
  await expect(first).toHaveClass(/copied/);
  await expect(first.locator("[role=status]")).toHaveText("已复制");
  await expect(first.getByRole("button", { name: "已复制 图一" })).toBeVisible();
  // Copying does not open the card.
  await expect(card(page)).toHaveCount(0);
});

// Pictures added together get no promised order, so tests that depend on a position pick tiles by their place on screen.
const mainButton = (locator) => locator.locator(".image-tile-main");

test("clicking a tile opens a full-width card under its row; another tile moves it; the same tile closes it", async ({ page }) => {
  await openImages(page);
  await addSix(page);

  await mainButton(tiles(page).nth(1)).click();
  await expect(card(page)).toHaveCount(1);
  await expect(tiles(page).nth(1)).toHaveClass(/selected/);
  await page.waitForTimeout(500); // the card opens with a short animation
  const allTiles = await boxes(tiles(page));
  const open = await card(page).boundingBox();
  const rowOne = allTiles.slice(0, 4);
  const rowTwo = allTiles.slice(4, 6);
  expect(open.y).toBeGreaterThan(Math.max(...rowOne.map((box) => box.y + box.height)) - 1);
  expect(Math.min(...rowTwo.map((box) => box.y))).toBeGreaterThan(open.y + open.height - 1);
  // The card is as wide as the four columns together.
  expect(Math.abs(open.width - (rowOne[3].x + rowOne[3].width - rowOne[0].x))).toBeLessThan(2);
  expect(Math.abs(open.x - rowOne[0].x)).toBeLessThan(2);
  await expect(card(page).locator(".image-preview img")).toBeVisible();
  for (const name of ["复制", "改名", "删除"]) await expect(card(page).getByRole("button", { name, exact: true })).toBeVisible();
  await expect(card(page).getByRole("button", { name: /^目录：未分类/ })).toBeVisible();
  await expect(tiles(page).nth(1).getByRole("button", { name: /^已展开 / })).toBeVisible();

  // Choosing a tile of the next row moves the card below that row.
  await mainButton(tiles(page).nth(4)).click();
  await expect(card(page)).toHaveCount(1);
  await expect(tiles(page).nth(1)).not.toHaveClass(/selected/);
  await expect(tiles(page).nth(4)).toHaveClass(/selected/);
  await page.waitForTimeout(500);
  const moved = await card(page).boundingBox();
  const rows = await boxes(tiles(page));
  expect(moved.y).toBeGreaterThan(Math.max(...rows.slice(4, 6).map((box) => box.y + box.height)) - 1);
  expect(moved.y).toBeGreaterThan(open.y);

  await mainButton(tiles(page).nth(4)).click();
  await expect(card(page)).toHaveCount(0);
  await expect(tiles(page).nth(4)).not.toHaveClass(/selected/);
});

test("a card opened on the last, short row scrolls into view and the copy button in the card copies", async ({ page }) => {
  await openImages(page);
  await addSix(page, ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一"]);
  await mainButton(tiles(page).last()).click();
  await expect(card(page).getByRole("button", { name: "删除", exact: true })).toBeInViewport({ ratio: 1 });
  await page.waitForTimeout(500);
  const rows = await boxes(tiles(page));
  const open = await card(page).boundingBox();
  expect(open.y).toBeGreaterThan(rows[10].y + rows[10].height - 1);
  await card(page).getByRole("button", { name: "复制", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedImage)).toEqual(PNG_SIGNATURE);
});

test("rename, move to a folder and delete all work from the card", async ({ page }) => {
  await openImages(page);
  await page.getByRole("button", { name: "新建目录" }).click();
  const folderInput = page.getByRole("textbox", { name: "新目录名称" });
  await folderInput.fill("收款码");
  await folderInput.press("Enter");
  await expect(sidebar(page).locator(".directory-row", { hasText: "收款码" })).toBeVisible();
  await sidebar(page).locator(".nav-item", { hasText: "全部图片" }).click();
  await addSix(page, ["图一", "图二", "图三", "图四"]);

  await tile(page, "图一").getByRole("button", { name: "展开 图一" }).click();
  await card(page).getByRole("button", { name: "改名", exact: true }).click();
  const input = card(page).getByRole("textbox", { name: "图片标题", exact: true });
  await expect(input).toBeFocused();
  await input.fill("微信收款码");
  await input.press("Enter");
  await expect(page.locator(".toast")).toContainText("已改名");
  await expect(card(page).locator(".image-card-title")).toHaveText("微信收款码");
  await expect(tile(page, "微信收款码")).toBeVisible();

  await card(page).getByRole("button", { name: /^目录：未分类/ }).click();
  await page.getByRole("menu", { name: "移动到" }).getByRole("menuitem", { name: "收款码" }).click();
  await expect(card(page).getByRole("button", { name: /^目录：收款码/ })).toBeVisible();
  await expect(sidebar(page).locator(".nav-item", { hasText: "收款码" })).toContainText("1");

  await card(page).getByRole("button", { name: "删除", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("永久删除这张图片？");
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(tiles(page)).toHaveCount(4);
  await card(page).getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "永久删除" }).click();
  await expect(tiles(page)).toHaveCount(3);
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator(".toast")).toContainText("图片已删除");
});

test("the 宫格 | 列表 switch changes the view and the choice survives a reload", async ({ page }) => {
  await openImages(page);
  await addSix(page, ["图一", "图二", "图三"]);
  const grid = page.getByRole("button", { name: "宫格视图" });
  const list = page.getByRole("button", { name: "列表视图" });
  await expect(grid).toHaveAttribute("aria-pressed", "true");
  await expect(list).toHaveAttribute("aria-pressed", "false");

  await list.click();
  await expect(page.locator(".image-row")).toHaveCount(3);
  await expect(page.locator(".image-tile")).toHaveCount(0);
  await expect(list).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("clipbox.image-view"))).toBe("list");

  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await expect(page.locator(".image-row")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "列表视图" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "宫格视图" }).click();
  await expect(tiles(page)).toHaveCount(3);
  await expect(page.locator(".image-row")).toHaveCount(0);
  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await expect(tiles(page)).toHaveCount(3);
});

test("an unknown stored view falls back to the grid", async ({ page }) => {
  await asDesktop(page, "win32", { imageView: "kaleidoscope" });
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
  await expect(page.getByRole("button", { name: "宫格视图" })).toHaveAttribute("aria-pressed", "true");
});

test("folders and search filter the grid", async ({ page }) => {
  await openImages(page);
  for (const name of ["收款码", "价目表"]) {
    await page.getByRole("button", { name: "新建目录" }).click();
    const input = page.getByRole("textbox", { name: "新目录名称" });
    await input.fill(name);
    await input.press("Enter");
    await expect(sidebar(page).locator(".directory-row", { hasText: name })).toBeVisible();
  }
  await sidebar(page).locator(".nav-item", { hasText: "收款码" }).click();
  await addImages(page, [png("码一"), png("码二"), png("码三"), png("码四")]);
  await sidebar(page).locator(".nav-item", { hasText: "价目表" }).click();
  await addImages(page, [png("价一")]);
  await sidebar(page).locator(".nav-item", { hasText: "全部图片" }).click();
  await addImages(page, [png("散图")]);
  await expect(tiles(page)).toHaveCount(6);

  await sidebar(page).locator(".nav-item", { hasText: "收款码" }).click();
  await expect(page.locator(".section-head h1")).toHaveText("收款码");
  await expect(tiles(page)).toHaveCount(4);
  const inFolder = await boxes(tiles(page));
  expect(inFolder[0].y).toBeCloseTo(inFolder[3].y, 0); // four per row

  await page.getByPlaceholder("搜索图片标题").fill("码二");
  await expect(tiles(page)).toHaveCount(1);
  await page.getByPlaceholder("搜索图片标题").fill("没有这个");
  await expect(page.locator(".image-list")).toContainText("没有匹配的图片");
  await page.getByPlaceholder("搜索图片标题").fill("");

  await sidebar(page).locator(".nav-item", { hasText: "未分类" }).click();
  await expect(tiles(page)).toHaveCount(1);
  await expect(tile(page, "散图")).toBeVisible();
  await sidebar(page).locator(".nav-item", { hasText: "全部图片" }).click();
  await expect(tiles(page)).toHaveCount(6);
});

test("extreme pictures neither overflow the window nor the opened card", async ({ page }) => {
  await openImages(page);
  const sizes = [[1920, 480], [300, 3000], [128, 128], [3000, 2000], [640, 360], [48, 48], [1000, 1000], [2400, 200], [200, 2400], [800, 600], [64, 64], [1600, 900]];
  await addImages(page, sizes.map(([width, height], index) => png(`图${index + 1}`, width, height, [40 + index * 15, 120, 220 - index * 12], { frame: [255, 80, 80] })));
  await expect(tiles(page)).toHaveCount(12);
  await expect.poll(() => page.locator(".image-tile-thumb img").evaluateAll((images) => images.every((img) => img.naturalWidth > 0))).toBe(true);

  const noOverflow = () => page.evaluate(() => {
    const list = document.querySelector(".image-list");
    return {
      page: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      list: list.scrollWidth <= list.clientWidth,
    };
  });
  expect(await noOverflow()).toEqual({ page: true, list: true });

  // Thumbnails show the whole picture, never a crop.
  for (const img of await page.locator(".image-tile-pic").all()) await expect(img).toHaveCSS("object-fit", "contain");
  // Every picture, even a square one, keeps a 6% margin on frosted glass.
  for (const index of [0, 2, 5]) {
    const thumb = await tiles(page).nth(index).locator(".image-tile-thumb").boundingBox();
    const pic = await tiles(page).nth(index).locator(".image-tile-pic").boundingBox();
    expect(Math.abs((pic.x - thumb.x) / thumb.width - 0.06)).toBeLessThan(0.03);
    expect(Math.abs((pic.y - thumb.y) / thumb.height - 0.06)).toBeLessThan(0.03);
    expect(Math.abs(pic.width / thumb.width - 0.88)).toBeLessThan(0.03);
    // The glass is colourless: no copy of the picture behind it, only a neutral translucent surface.
    await expect(tiles(page).nth(index).locator(".image-tile-glass")).toHaveCount(0);
    const glass = await tiles(page).nth(index).locator(".image-tile-thumb").evaluate((el) => getComputedStyle(el, "::after").backgroundImage);
    expect(glass).toMatch(/gradient/);
  }
  // Every tile is a square whatever the picture's shape, and the four columns are equal.
  for (const thumb of await boxes(page.locator(".image-tile-thumb"))) expect(Math.abs(thumb.width - thumb.height)).toBeLessThan(1.5);
  const all = await boxes(tiles(page));
  expect(Math.max(...all.slice(0, 4).map((box) => box.width)) - Math.min(...all.slice(0, 4).map((box) => box.width))).toBeLessThan(1.5);

  for (const [index, title] of [[0, "图1"], [1, "图2"], [3, "图4"], [10, "图11"]]) {
    await tile(page, title).getByRole("button", { name: `展开 ${title}` }).click();
    await expect(card(page)).toHaveCount(1);
    await expect.poll(() => card(page).locator(".image-preview img").evaluate((img) => img.naturalWidth)).toBe(sizes[index][0]);
    await page.waitForTimeout(500);
    const panel = await page.locator(".content-panel").boundingBox();
    const open = await card(page).boundingBox();
    const preview = await card(page).locator(".image-preview img").boundingBox();
    expect(open.x).toBeGreaterThanOrEqual(panel.x);
    expect(open.x + open.width).toBeLessThanOrEqual(panel.x + panel.width);
    expect(preview.x).toBeGreaterThanOrEqual(open.x);
    expect(preview.x + preview.width).toBeLessThanOrEqual(open.x + open.width);
    expect(preview.height).toBeLessThanOrEqual(260);
    expect(await noOverflow()).toEqual({ page: true, list: true });
  }
});

test("the mini window shows a four-column grid, no switch, and a click copies", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 680, height: 620 }, locale: "zh-CN" });
  const page = await context.newPage();
  await openImages(page);
  await addSix(page, ["图一", "图二", "图三", "图四", "图五"]);
  await page.getByRole("button", { name: "迷你模式" }).click();
  await page.setViewportSize({ width: 360, height: 440 });
  await expect(page.locator(".mini-tile")).toHaveCount(5);
  await page.waitForTimeout(500); // the window resizes and the tiles fade in; measure after they settle
  await expect(page.getByRole("button", { name: "宫格视图" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "列表视图" })).toHaveCount(0);
  const all = await boxes(page.locator(".mini-tile"));
  expect(all[0].y).toBeCloseTo(all[1].y, 0);
  expect(all[2].y).toBeCloseTo(all[3].y, 0);
  expect(all[4].y).toBeGreaterThan(all[0].y + 30);
  expect(Math.abs(all[4].x - all[0].x)).toBeLessThan(2);
  expect(all[3].x + all[3].width).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(Number.parseFloat(await page.locator(".mini-tile .image-tile-title").first().evaluate((title) => getComputedStyle(title).fontSize))).toBe(11);
  await page.getByPlaceholder("搜索图片").fill("图三");
  await expect(page.locator(".mini-tile")).toHaveCount(1);
  await page.getByRole("button", { name: "复制 图三" }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedImage)).toEqual(PNG_SIGNATURE);
  await expect(page.locator(".image-card")).toHaveCount(0);
  await context.close();
});

test("macOS shows the grid too, with the switch", async ({ page }) => {
  await openImages(page, "darwin");
  await addSix(page, ["图一", "图二", "图三", "图四", "图五"]);
  await expect(page.getByRole("button", { name: "宫格视图" })).toHaveAttribute("aria-pressed", "true");
  const all = await boxes(tiles(page));
  expect(all[0].y).toBeCloseTo(all[3].y, 0);
  expect(all[4].y).toBeGreaterThan(all[0].y + 40);
  await tile(page, "图四").getByRole("button", { name: "展开 图四" }).click();
  await expect(card(page)).toHaveCount(1);
  await card(page).getByRole("button", { name: "复制", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedImage)).toEqual(PNG_SIGNATURE);
});
