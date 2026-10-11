import { expect, test } from "@playwright/test";
import { pinyin } from "pinyin-pro";
import { seedSnippets } from "./helpers.mjs";

test.beforeEach(async ({ page }) => { await seedSnippets(page); });

test("importing the sample sheet gives 34 snippets and the standard folders", async ({ page }) => {
  await expect(page.locator(".native-row")).toHaveCount(34);
  await expect(page.locator(".sidebar")).toContainText("询盘接待");
});

test("switching entries folds the old card away gradually instead of removing it at once", async ({ page }) => {
  await page.locator(".native-row .row-main").nth(1).click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__heights = [];
    const start = performance.now();
    const tick = () => {
      const closing = document.querySelector(".row-detail.closing");
      if (closing) window.__heights.push(closing.getBoundingClientRect().height);
      if (performance.now() - start < 500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.locator(".native-row .row-main").nth(4).click();
  await page.waitForTimeout(700);
  const heights = await page.evaluate(() => window.__heights);
  expect(heights.length).toBeGreaterThan(4);
  expect(heights[0]).toBeGreaterThan(heights.at(-1));
  await expect(page.locator(".row-detail.closing")).toHaveCount(0);
  await expect(page.locator(".native-row.selected")).toHaveCount(1);
  // the fading border must not show the white card background underneath
  const clip = await page.locator(".native-row.selected").evaluate((row) => getComputedStyle(row).backgroundClip);
  expect(clip).toBe("padding-box");
});

test("variables are highlighted blocks without brackets and are typed in place", async ({ page }) => {
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, "writeText", { value: async (text) => { window.__copied = text; }, configurable: true }); });
  const rows = page.locator(".native-row .row-main");
  await rows.first().click();
  const row = page.locator(".native-row.selected");
  // the open card shows fields, not bracketed text, and there is no separate fill page or button
  await expect(row.locator(".row-content")).not.toContainText("[");
  await expect(row.getByRole("button", { name: "填写变量" })).toHaveCount(0);
  await expect(page.locator(".fill-panel")).toHaveCount(0);
  const name = row.locator("input[data-var=Name]");
  const widthBefore = (await name.evaluate((input) => input.parentElement.getBoundingClientRect().width));
  await name.click();
  await page.keyboard.type("Amanda Rodriguez");
  const widthAfter = (await name.evaluate((input) => input.parentElement.getBoundingClientRect().width));
  expect(widthAfter).toBeGreaterThan(widthBefore);
  // an unfinished variable stops the copy and puts the cursor in the next empty block
  await row.getByRole("button", { name: "复制", exact: true }).click();
  await expect(row.locator("input[data-var=Company]")).toBeFocused();
  await page.keyboard.type("Comely Beauty");
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("Hi Amanda Rodriguez, thanks for reaching out to Comely Beauty! How can I help you today?");
  // the closed list shows variables as plain highlighted names too
  await rows.nth(1).click();
  await expect(page.locator(".snippet-preview").first()).not.toContainText("[");
});

test("a variable remembers the last value, and with one variable Enter copies the finished text", async ({ page }) => {
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, "writeText", { value: async (text) => { window.__copied = text; }, configurable: true }); });
  await page.locator(".native-row", { hasText: "自我介绍" }).locator(".row-main").click();
  const row = page.locator(".native-row.selected");
  await expect(row).toHaveCount(1);
  // typing then Enter walks through the empty blocks; the last Enter copies
  await row.locator("input[data-var=Name]").click();
  await page.keyboard.type("Amanda");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Comely");
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("Hi Amanda, thanks for reaching out to Comely! How can I help you today?");
  // another snippet with the same variable starts with the remembered value, marked as remembered
  await page.locator(".native-row", { hasText: "二次问候" }).locator(".row-main").click();
  await expect(page.locator(".native-row.selected")).toHaveCount(1);
  const same = page.locator(".native-row.selected input[data-var=Name]");
  await expect(same).toHaveValue("Amanda");
  await expect(same.locator("..")).toHaveAttribute("data-remembered", "");
  // carried-over values are shown before they go out: the first copy only asks for a look, the second one copies
  const earlier = await page.evaluate(() => window.__copied);
  await same.click();
  await page.keyboard.press("Enter");
  await expect(page.getByText("确认没错再复制一次")).toBeVisible();
  expect(await page.evaluate(() => window.__copied)).toBe(earlier);
  await expect(same.locator("..")).not.toHaveAttribute("data-remembered", "");
  await same.click();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__copied)).not.toBe(earlier);
  await expect.poll(() => page.evaluate(() => window.__copied)).toContain("Amanda");
});

test("a block offers its last three values; clicking one fills it and copies when nothing else is missing", async ({ page }) => {
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, "writeText", { value: async (text) => { window.__copied = text; }, configurable: true }); });
  await page.locator(".native-row", { hasText: "自我介绍" }).locator(".row-main").click();
  const row = page.locator(".native-row.selected");
  for (const [name, company] of [["Amanda", "Comely"], ["Bella", "Comely"], ["Cara", "Comely"], ["Dana", "Comely"]]) {
    await row.locator("input[data-var=Name]").fill(name);
    await row.locator("input[data-var=Company]").fill(company);
    await row.locator("input[data-var=Company]").press("Enter");
    await expect.poll(() => page.evaluate(() => window.__copied)).toContain(name);
  }
  // only the newest three are offered, newest first
  await row.locator("input[data-var=Name]").click();
  const options = row.locator("[aria-label='Name 最近用过的'] .var-memory-option");
  await expect(options).toHaveText(["Dana", "Cara", "Bella"]);
  // every other block is filled, so one click fills and copies
  await options.nth(2).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("Hi Bella, thanks for reaching out to Comely! How can I help you today?");
  // the copy moved Bella to the front: [Bella, Dana, Cara]; with another block empty, a click only fills and moves on
  await row.locator("input[data-var=Company]").fill("");
  await row.locator("input[data-var=Name]").click();
  await row.locator("[aria-label='Name 最近用过的'] .var-memory-option").nth(1).click();
  await expect(row.locator("input[data-var=Name]")).toHaveValue("Dana");
  await expect(row.locator("input[data-var=Company]")).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.__copied)).toContain("Bella");
});

test("Name offers Beautiful, Friend and Lovely above the block; Friend goes out when nothing is chosen", async ({ page }) => {
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, "writeText", { value: async (text) => { window.__copied = text; }, configurable: true }); });
  await page.locator(".native-row", { hasText: "自我介绍" }).locator(".row-main").click();
  const row = page.locator(".native-row.selected");
  await expect(row.locator("input[data-var=Name]")).toHaveValue("Friend");
  await row.locator("input[data-var=Company]").fill("Comely");
  await row.getByRole("button", { name: "复制", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("Hi Friend, thanks for reaching out to Comely! How can I help you today?");
  const chip = row.locator(".var-chip", { has: page.locator("input[data-var=Name]") });
  await row.locator("input[data-var=Name]").click();
  const popup = page.locator(".var-popup");
  await expect(popup.locator(".var-popup-option")).toHaveText(["Beautiful", "Friend", "Lovely"]);
  // this card has the 英文/中文 switch above its text, so the choices open below the block and never cover it
  await expect(row.locator(".copy-language")).toBeVisible();
  // the card and the popup settle after a short animation (slower on a busy machine), so read the boxes until they do
  await expect.poll(async () => {
    const chipBox = await chip.boundingBox();
    const popupBox = await popup.boundingBox();
    const switchBox = await row.locator(".copy-language").boundingBox();
    if (!chipBox || !popupBox || !switchBox) return "waiting";
    const overlap = Math.min(popupBox.y + popupBox.height, switchBox.y + switchBox.height) - Math.max(popupBox.y, switchBox.y);
    return popupBox.y > chipBox.y && overlap <= 0 ? "below" : `y ${popupBox.y} chip ${chipBox.y} overlap ${overlap}`;
  }, { timeout: 5000 }).toBe("below");
  await popup.getByRole("option", { name: "Lovely" }).click();
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("Hi Lovely, thanks for reaching out to Comely! How can I help you today?");
});

test("remembered values stay after many clicks; a right-click pins one so new values never push it out; ? explains", async ({ page }) => {
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, "writeText", { value: async (text) => { window.__copied = text; }, configurable: true }); });
  await page.locator(".native-row", { hasText: "自我介绍" }).locator(".row-main").click();
  const row = page.locator(".native-row.selected");
  const name = row.locator("input[data-var=Name]");
  await row.locator("input[data-var=Company]").fill("Comely");
  for (const value of ["Amanda", "Bella", "Cara"]) { await name.fill(value); await name.press("Enter"); await expect.poll(() => page.evaluate(() => window.__copied)).toContain(value); }
  // clicking the same block again and again keeps all three
  for (let round = 0; round < 4; round += 1) {
    await name.click();
    await expect(row.locator("[aria-label='Name 最近用过的'] .var-memory-option")).toHaveCount(3);
  }
  // pin Amanda from the list, then push three newer values through
  await row.locator("[aria-label='Name 最近用过的'] .var-memory-option", { hasText: "Amanda" }).click({ button: "right" });
  await expect(page.locator(".var-menu button")).toHaveText(["固定", "解锁", "删除"]);
  await expect(page.getByRole("menuitem", { name: "解锁" })).toBeDisabled();
  await page.getByRole("menuitem", { name: "固定" }).click();
  await expect(page.getByText("已固定「Amanda」")).toBeVisible();
  // only the pinned value is kept on the device, so it is still there after a reload
  expect(await page.evaluate(() => localStorage.getItem("clipbox.pinned-values.v1"))).toBe('{"Name":["Amanda"]}');
  for (const value of ["Dana", "Eve", "Fay"]) { await name.fill(value); await name.press("Enter"); await expect.poll(() => page.evaluate(() => window.__copied)).toContain(value); }
  await name.click();
  await expect(row.locator("[aria-label='Name 最近用过的'] .var-memory-option")).toHaveText(["Amanda", "Fay", "Eve"]);
  await expect(row.locator("[aria-label='Name 最近用过的'] .var-memory-option[data-pinned]")).toHaveText(["Amanda"]);
  // right-click on the block itself unpins its current value
  await name.fill("Amanda");
  await row.locator(".var-chip", { has: page.locator("input[data-var=Name]") }).click({ button: "right" });
  await expect(page.getByText("已取消固定「Amanda」")).toBeVisible();
  // the ? at the right edge of the block
  await row.locator(".var-help").first().click();
  const hint = page.locator(".toast-line", { hasText: "固定的不会被新值顶掉" });
  await expect(hint).toBeVisible();
  // the whole sentence shows, nothing is cut off by an ellipsis
  expect(await hint.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("each remembered value has a six-dot handle; tapping it offers 上移 and 下移, and the value itself still fills", async ({ page }) => {
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, "writeText", { value: async (text) => { window.__copied = text; }, configurable: true }); });
  await page.locator(".native-row", { hasText: "自我介绍" }).locator(".row-main").click();
  const row = page.locator(".native-row.selected");
  const name = row.locator("input[data-var=Name]");
  await row.locator("input[data-var=Company]").fill("Comely");
  for (const value of ["Amanda", "Bella", "Cara"]) { await name.fill(value); await name.press("Enter"); await expect.poll(() => page.evaluate(() => window.__copied)).toContain(value); }
  await name.click();
  const options = row.locator("[aria-label='Name 最近用过的'] .var-memory-option");
  await expect(options).toHaveText(["Cara", "Bella", "Amanda"]);
  await expect(options.first().locator(".var-grip .icon")).toBeVisible();
  await options.nth(1).locator(".var-grip").click();
  await page.getByRole("menuitem", { name: "上移" }).click();
  await expect(options).toHaveText(["Bella", "Cara", "Amanda"]);
  await expect(name).toHaveValue("Cara");
  await options.nth(2).locator(".var-grip").click();
  await expect(page.getByRole("menuitem", { name: "下移" })).toBeDisabled();
  await page.keyboard.press("Escape");
});
test("a right-click on a remembered value offers 固定, 解锁 and 删除; holding and moving one changes its place", async ({ page }) => {
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, "writeText", { value: async (text) => { window.__copied = text; }, configurable: true }); });
  await page.locator(".native-row", { hasText: "自我介绍" }).locator(".row-main").click();
  const row = page.locator(".native-row.selected");
  const name = row.locator("input[data-var=Name]");
  await row.locator("input[data-var=Company]").fill("Comely");
  for (const value of ["Amanda", "Bella", "Cara"]) { await name.fill(value); await name.press("Enter"); await expect.poll(() => page.evaluate(() => window.__copied)).toContain(value); }
  await name.click();
  const options = row.locator("[aria-label='Name 最近用过的'] .var-memory-option");
  await expect(options).toHaveText(["Cara", "Bella", "Amanda"]);
  // drag Amanda (last) in front of Cara by holding and moving
  const from = await options.nth(2).locator(".var-grip").boundingBox();
  const to = await options.nth(0).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  // while held, the value follows the pointer with a lift; the others slide instead of jumping
  const held = row.locator(".var-memory-option[data-dragging]");
  await expect(held).toHaveText("Amanda");
  expect(await held.evaluate((element) => element.style.transform)).toMatch(/translateX/);
  await page.mouse.up();
  await expect(row.locator(".var-memory-option[data-dragging]")).toHaveCount(0);
  await expect(options).toHaveText(["Amanda", "Cara", "Bella"]);
  // dropping did not count as a click: nothing was filled or copied
  await expect(name).toHaveValue("Cara");
  // pin Bella, then unpin her again from the menu
  await options.filter({ hasText: "Bella" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "固定" }).click();
  await expect(options.filter({ hasText: "Bella" })).toHaveAttribute("data-pinned", "");
  await expect(options.first()).toHaveText("Bella");
  // leave the block so its choices (which open below it on this card) no longer sit over the list
  await name.blur();
  // bring the list fully into view first: a scroll after the menu opened would close it
  await options.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await options.first().click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "固定" })).toBeDisabled();
  await page.getByRole("menuitem", { name: "解锁" }).click();
  await expect(options.filter({ hasText: "Bella" })).not.toHaveAttribute("data-pinned", "");
  // delete Cara
  await options.filter({ hasText: "Cara" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "删除" }).click();
  await expect(options).toHaveCount(2);
  await expect(options.filter({ hasText: "Cara" })).toHaveCount(0);
  // Escape closes the menu without doing anything
  await options.first().click({ button: "right" });
  await page.keyboard.press("Escape");
  await expect(page.locator(".var-menu")).toHaveCount(0);
});

test("the Chinese text only asks for its own variables, and a long value stays inside the card", async ({ page }) => {
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, "writeText", { value: async (text) => { window.__copied = text; }, configurable: true }); });
  await page.locator(".native-row", { hasText: "需要整理的文本" }).first().locator(".row-main").click();
  const row = page.locator(".native-row.selected:not(.closing-row)");
  await row.getByRole("button", { name: "中文" }).click();
  // the Chinese text has only [Sender]; [Name] belongs to the English text and must not block the copy
  await expect(row.locator("input[data-var]")).toHaveCount(1);
  await row.locator("input[data-var=Sender]").fill("Amanda 1234 Long Street Name Apartment 56 Springfield Illinois 62704 United States");
  const chip = await row.locator(".var-chip").boundingBox();
  const box = await row.locator(".row-content").boundingBox();
  expect(chip.x + chip.width).toBeLessThanOrEqual(box.x + box.width + 1);
  await row.locator("input[data-var=Sender]").press("Enter");
  await expect.poll(() => page.evaluate(() => window.__copied)).toContain("Amanda 1234 Long Street");
});

test("no keyboard shortcut hints anywhere and Ctrl+E does nothing", async ({ page }) => {
  await expect(page.locator("kbd")).toHaveCount(0);
  await page.keyboard.press("Control+e");
  await page.waitForTimeout(200);
  await expect(page.locator(".inline-editor")).toHaveCount(0);
  // plain arrows in the search box still move the selection
  await page.locator("input[placeholder*=搜索]").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".native-row.selected")).toHaveCount(1);
});

test("the snippet note field is called 小提示", async ({ page }) => {
  await page.getByRole("button", { name: /新增/ }).first().click();
  await page.locator(".inline-editor input").first().fill("测试话术");
  await page.locator(".inline-editor textarea").first().fill("Hello there");
  await page.locator(".inline-editor .editor-save").first().click();
  await page.locator(".native-row", { hasText: "测试话术" }).locator(".row-main").click();
  await page.locator(".native-row.selected").getByRole("button", { name: "编辑" }).click();
  await expect(page.locator(".inline-editor")).toContainText("小提示");
  await expect(page.locator(".inline-editor")).not.toContainText("备注");
});

test("when adding a 话术 by hand, selected words can be set as highlighted blocks", async ({ page }) => {
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, "writeText", { value: async (text) => { window.__copied = text; }, configurable: true }); });
  await page.getByRole("button", { name: /新增/ }).first().click();
  const editor = page.locator(".inline-editor");
  await editor.locator("input").first().fill("手动高亮测试");
  const area = editor.getByRole("textbox", { name: "话术内容" });
  await area.fill("Hi dear friend, welcome to our shop!");
  await expect(editor).toContainText("设为高亮");
  // nothing selected: refused with a plain message
  await area.evaluate((element) => element.setSelectionRange(3, 3));
  await editor.getByRole("button", { name: "设为高亮" }).click();
  await expect(editor.locator(".variable-hint")).toContainText("先选中一段文字");
  // select "dear friend" and set it
  await area.evaluate((element) => { const at = element.value.indexOf("dear friend"); element.setSelectionRange(at, at + "dear friend".length); });
  await editor.getByRole("button", { name: "设为高亮" }).click();
  await expect(area).toHaveValue("Hi [dear friend], welcome to our shop!");
  await expect(editor.locator(".variable-hint")).toContainText("高亮块：dear friend");
  // the caret is inside the block: take it off again, then set it once more
  await editor.getByRole("button", { name: "取消高亮" }).click();
  await expect(area).toHaveValue("Hi dear friend, welcome to our shop!");
  await area.evaluate((element) => { const at = element.value.indexOf("dear friend"); element.setSelectionRange(at, at + "dear friend".length); });
  await editor.getByRole("button", { name: "设为高亮" }).click();
  await editor.locator(".editor-save").first().click();
  // the saved 话术 shows a highlighted block that can be filled, and copies the filled text
  await page.locator(".native-row", { hasText: "手动高亮测试" }).locator(".row-main").click();
  const row = page.locator(".native-row.selected");
  const field = row.locator("input[data-var='dear friend']");
  await expect(field).toBeVisible();
  await field.fill("Amanda");
  await field.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe("Hi Amanda, welcome to our shop!");
});

test("the 全部产品 filter and the row menu close on an outside click and on Esc", async ({ page }) => {
  const filter = page.locator(".product-filter");
  const menu = page.locator(".product-filter-menu");
  await filter.click();
  await expect(menu).toBeVisible();
  await page.locator(".section-head, h1").first().click({ position: { x: 4, y: 4 } });
  await expect(menu).toHaveCount(0);

  await filter.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // Opening the filter then a row's ⋯ menu leaves only one open; an outside click closes it.
  await filter.click();
  await page.locator(".row-main").first().click();
  await page.getByRole("button", { name: /^更多操作/ }).first().click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator(".row-menu")).toBeVisible();
  await page.locator(".search-box, input[type=search], .sidebar").first().click({ position: { x: 4, y: 4 } });
  await expect(page.locator(".row-menu")).toHaveCount(0);
});

test("menus fade in and out quickly (arc step 3) and do not move at all with reduced motion", async ({ page }) => {
  const filter = page.locator(".product-filter");
  const menu = page.locator(".product-filter-menu");
  await filter.click();
  await expect(menu).toBeVisible();
  // Settled: fully opaque and not scaled.
  await expect.poll(() => menu.evaluate((el) => `${getComputedStyle(el).opacity}|${getComputedStyle(el).transform}`)).toMatch(/^1\|(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0, { timeout: 2000 }); // the exit is short, the menu does not linger

  await page.emulateMedia({ reducedMotion: "reduce" });
  await filter.click();
  expect(await menu.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("typing pinyin initials finds Chinese snippets", async ({ page }) => {
  const search = page.locator("input[placeholder*=搜索]");
  const total = await page.locator(".native-row").count();
  await search.fill("zzzzq");
  await expect(page.locator(".native-row")).toHaveCount(0);
  const syllables = pinyin("询盘", { toneType: "none", type: "array" });
  await search.fill(syllables.map((syllable) => syllable[0]).join(""));
  const found = await page.locator(".native-row").count();
  expect(found).toBeGreaterThan(0);
  expect(found).toBeLessThan(total);
  await expect(page.locator(".native-row").first()).toBeVisible();
});

test("English word search is a separate mode next to the pinyin one", async ({ page }) => {
  const search = page.locator("input[placeholder*=搜索]");
  await search.fill("lashes");
  const modes = page.getByRole("group", { name: "搜索方式" });
  await expect(modes).toBeVisible();
  await modes.getByRole("button", { name: "英文单词" }).click();
  await expect(search).toHaveAttribute("placeholder", "搜索英文单词");
  expect(await page.locator(".native-row").count()).toBeGreaterThan(0);
  await search.fill("zzzzq");
  await expect(page.locator(".native-row")).toHaveCount(0);
  await search.fill("");
  await expect(search).toHaveAttribute("placeholder", "搜索标题、编号或内容");
});

test("the sidebar entry says 最近 (it used to be cut off); its page is still titled 最近使用", async ({ page }) => {
  await page.goto("/");
  const entry = page.locator(".sidebar .nav-item", { hasText: "最近" });
  await expect(entry).toBeVisible();
  await expect(entry).not.toContainText("最近使用");
  // The whole label fits: no ellipsis cut-off.
  const label = entry.locator("span").first();
  expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await entry.click();
  await expect(page.locator("h1")).toHaveText("最近使用");
});

test("dialog backdrops fade in by tint only: the blurred page behind is not re-blurred every frame (Mac smoothness)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "设置" }).click();
  const backdrop = page.locator(".settings-backdrop");
  await expect(backdrop).toBeVisible();
  const info = await backdrop.evaluate((el) => {
    const style = getComputedStyle(el);
    let keyframes = "";
    for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) if (rule.type === CSSRule.KEYFRAMES_RULE && rule.name === style.animationName) keyframes = rule.cssText;
    return { blur: style.backdropFilter || style.webkitBackdropFilter, name: style.animationName, keyframes };
  });
  expect(info.blur).toContain("blur");
  expect(info.name).toBe("backdrop-in");
  expect(info.keyframes).not.toMatch(/opacity/);
  expect(info.keyframes).toMatch(/background-color/);
});

test("remembered values are always shown with the ? at their right end, and not inside the text", async ({ page }) => {
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, "writeText", { value: async (text) => { window.__copied = text; }, configurable: true }); });
  await page.locator(".native-row", { hasText: "自我介绍" }).locator(".row-main").click();
  const row = page.locator(".native-row.selected");
  await row.locator("input[data-var=Company]").fill("Comely");
  await row.locator("input[data-var=Name]").fill("Amanda");
  await row.locator("input[data-var=Name]").press("Enter");
  await expect.poll(() => page.evaluate(() => window.__copied)).toContain("Amanda");
  // click away from every block: the strip stays
  await row.locator(".row-actions").click({ position: { x: 2, y: 2 } });
  await expect(row.locator("input:focus")).toHaveCount(0);
  await expect(row.locator(".var-memory-option", { hasText: "Amanda" }).first()).toBeVisible();
  await expect(row.locator(".var-chip .var-help")).toHaveCount(0);
  const help = row.locator(".var-memory .var-help");
  await expect(help).toBeVisible();
  // the strip stays on the same line as the buttons, to the right of 编辑 (Lock's placement), and never pushes the card wider
  const edit = await row.getByRole("button", { name: "编辑", exact: true }).boundingBox();
  const strip = await row.locator(".var-memory").boundingBox();
  expect(strip.x).toBeGreaterThanOrEqual(edit.x + edit.width);
  expect(Math.abs((strip.y + strip.height / 2) - (edit.y + edit.height / 2))).toBeLessThan(10);
  expect(await page.locator(".native-list").evaluate((list) => list.scrollWidth <= list.clientWidth)).toBe(true);
});

test("a 话术 written by hand can carry its own 中文翻译, kept exactly as typed", async ({ page }) => {
  await page.getByRole("button", { name: /新增/ }).first().click();
  const editor = page.locator(".inline-editor");
  await expect(editor.getByLabel(/中文翻译/)).toBeVisible();
  await editor.locator("input").first().fill("手写问候");
  await editor.locator("textarea").first().fill("Hello there");
  await editor.getByLabel(/中文翻译/).fill("你好呀");
  await editor.locator(".editor-save").first().click();
  const row = page.locator(".native-row", { hasText: "手写问候" });
  await row.locator(".row-main").click();
  await expect(page.locator(".native-row.selected .copy-language")).toBeVisible();
  await page.locator(".native-row.selected").getByRole("button", { name: "编辑" }).click();
  await expect(page.locator(".inline-editor").getByLabel(/中文翻译/)).toHaveValue("你好呀");
});

test("the 新建目录 field keeps its whole border and placeholder inside the narrow sidebar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "新建目录" }).first().click();
  const form = page.locator(".directory-new");
  await expect(form).toBeVisible();
  // The folder list scrolls, so an outer ring would be clipped on both sides: the ring must be drawn inside the box.
  expect(await form.evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(/inset/);
  const [box, side] = await Promise.all([form.boundingBox(), page.locator(".sidebar").boundingBox()]);
  expect(box.x).toBeGreaterThanOrEqual(side.x);
  expect(box.x + box.width).toBeLessThanOrEqual(side.x + side.width);
  // The whole placeholder fits in the input (no cut-off text).
  const input = form.locator("input");
  expect(await input.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test("a folder can be dragged by the three-bar handle on its left, right in the sidebar, and Settings shows the same order", async ({ page }) => {
  const names = () => page.locator(".sidebar .directory-row .directory-main").evaluateAll((els) => els.map((el) => el.getAttribute("title")));
  for (const name of ["甲", "乙", "丙"]) {
    await page.getByRole("button", { name: "新建目录" }).first().click();
    await page.locator(".directory-new input").fill(name);
    await page.keyboard.press("Enter");
    await expect(page.locator(".sidebar .directory-row", { hasText: name })).toBeVisible();
  }
  const row = (name) => page.locator(".sidebar .directory-row", { hasText: name });
  // Standard folders are fixed: no handle.
  await expect(row("询盘接待").locator(".folder-drag-handle")).toHaveCount(0);

  // The handle is on the far left, over the colour dot, and appears on hover.
  await row("甲").hover();
  const handle = row("甲").locator(".folder-drag-handle");
  await expect(handle).toHaveCSS("opacity", "1");
  const [h, label, rowBox] = await Promise.all([handle.boundingBox(), row("甲").locator(".directory-main").boundingBox(), row("甲").boundingBox()]);
  expect(h.x - rowBox.x).toBeLessThanOrEqual(8);
  expect(h.x + h.width).toBeLessThan(label.x + label.width / 2);
  await expect(row("甲").locator(".directory-color-marker")).toHaveCSS("opacity", "0");

  const before = await names();
  const target = await row("丙").boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y + 20, { steps: 4 });
  await page.mouse.move(h.x + h.width / 2, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await names()).indexOf("甲")).toBeGreaterThan(before.indexOf("甲"));
  // A drag never opens the little menu.
  await expect(page.getByRole("menu", { name: /拖动目录/ })).toHaveCount(0);
  const after = await names();

  // The same list lives in Settings.
  await page.getByRole("button", { name: /设置/ }).first().click();
  await page.locator(".settings-dialog").getByRole("tab", { name: "目录" }).click();
  const group = page.locator(".settings-dialog .settings-folder-group").nth(0);
  await group.getByRole("button", { name: /话术目录/ }).click();
  expect(await group.locator(".settings-folder-name").allInnerTexts()).toEqual(after);

  // Every drag handle is the same six-dot pill.
  const look = (locator) => locator.evaluate((element) => { const c = getComputedStyle(element); return { w: c.width, h: c.height, r: c.borderRadius, dots: element.querySelector("path").getAttribute("d").split("M").length - 1 }; });
  const settingsLook = await look(group.locator(".settings-folder-grip .icon").first());
  expect(settingsLook).toEqual({ w: "16px", h: "22px", r: "999px", dots: 6 });
  await page.keyboard.press("Escape");
  const sidebarLook = await look(page.locator(".sidebar .folder-drag-handle .icon").first());
  expect(sidebarLook.dots).toBe(6);
  expect(sidebarLook.r).toBe("999px");
});

test("the 话术内容 and 中文翻译 boxes are about three lines when short, grow while typing and stop at a limit", async ({ page }) => {
  await page.getByRole("button", { name: /新增/ }).first().click();
  const editor = page.locator(".inline-editor");
  const content = editor.getByRole("textbox", { name: "话术内容" });
  const chinese = editor.getByLabel(/中文翻译/);
  const heights = async () => [await content.evaluate((e) => e.getBoundingClientRect().height), await chinese.evaluate((e) => e.getBoundingClientRect().height)];
  const [emptyContent, emptyChinese] = await heights();
  expect(emptyContent).toBeLessThan(90);
  expect(emptyChinese).toBeLessThan(90);
  await content.fill("Hello there");
  expect((await heights())[0]).toBeLessThan(90);
  await content.fill(Array.from({ length: 6 }, (_, i) => `line ${i + 1}`).join("\n"));
  const six = (await heights())[0];
  expect(six).toBeGreaterThan(emptyContent + 30);
  await content.fill(Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\n"));
  const many = (await heights())[0];
  expect(many).toBeLessThan(220);
  expect(await content.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  await chinese.fill("一\n二\n三\n四\n五");
  expect((await heights())[1]).toBeGreaterThan(emptyChinese + 15);
});

test("a click on a drag handle opens 上移 / 下移, greyed at the ends, and a card moves too", async ({ page }) => {
  const names = () => page.locator(".sidebar .directory-row .directory-main").evaluateAll((els) => els.map((el) => el.getAttribute("title")));
  for (const name of ["甲", "乙", "丙"]) {
    await page.getByRole("button", { name: "新建目录" }).first().click();
    await page.locator(".directory-new input").fill(name);
    await page.keyboard.press("Enter");
    await expect(page.locator(".sidebar .directory-row", { hasText: name })).toBeVisible();
  }
  const row = (n) => page.locator(".sidebar .directory-row", { hasText: n });
  await row("甲").hover();
  await row("甲").locator(".folder-drag-handle").click();
  const menu = page.getByRole("menu", { name: "拖动目录 甲" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveText(["上移", "下移"]);
  await expect(menu.getByRole("menuitem", { name: "上移" })).toBeDisabled();
  await menu.getByRole("menuitem", { name: "下移" }).click();
  await expect(menu).toHaveCount(0);
  await expect.poll(async () => { const n = await names(); return n.indexOf("乙") < n.indexOf("甲"); }).toBe(true);
  await row("丙").hover();
  await row("丙").locator(".folder-drag-handle").click();
  await expect(page.getByRole("menu", { name: "拖动目录 丙" }).getByRole("menuitem", { name: "下移" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "拖动目录 丙" })).toHaveCount(0);

  // Cards: the first one cannot go up; 下移 swaps it with the next.
  await page.locator(".sidebar .nav-item", { hasText: "全部" }).first().click();
  const titles = () => page.locator(".native-row .row-main").evaluateAll((els) => els.slice(0, 3).map((el) => el.getAttribute("aria-label")));
  const first = await titles();
  await page.locator(".native-row .drag-handle").first().click();
  const cardMenu = page.getByRole("menu", { name: /拖动排序/ });
  await expect(cardMenu.getByRole("menuitem", { name: "上移" })).toBeDisabled();
  await cardMenu.getByRole("menuitem", { name: "下移" }).click();
  await expect.poll(async () => (await titles())[0]).not.toBe(first[0]);
});
