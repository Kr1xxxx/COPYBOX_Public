// Layout guard: opens every screen, dialog and menu on Windows/Mac × light/dark × normal/mini window
// and fails on clipped borders, cut-off text, popups outside the window, page-wide horizontal scroll,
// overlapping controls and unreadable text (contrast < 3). The detector is layout-detect.js.
// NEW inputs, menus or dialogs: add their opening steps to `states` below.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { asDesktop, seedSnippets } from "./helpers.mjs";

const DETECT = readFileSync(new URL("./layout-detect.js", import.meta.url), "utf8");
const PNG = fileURLToPath(new URL("../fixtures/sample-gradient.png", import.meta.url));
const JPG = fileURLToPath(new URL("../fixtures/sample-photo.jpg", import.meta.url));

// Known issues being fixed in other threads. Each entry needs a reason. Remove the entry once the fix lands
// (a stale entry that no longer matches anything is reported as a note, not a failure).
// match: [state-name regexp, issue type, element-text regexp]
const KNOWN = [
];

// Deliberate design, not a bug: a one-line list title that ends in "…" when the text is too long.
const BY_DESIGN = [
  { el: /snippet-label/, type: /文字省略/, reason: "列表标题单行显示，过长时用 … 结尾（测试数据里有超长场景名）" },
];

BY_DESIGN.push({ el: /image-tile-title/, type: /文字省略/, reason: "图片名单行显示，过长时用 … 结尾（迷你窗口的小图块只有约 80px 宽）" });
BY_DESIGN.push({ el: /image-tile-main/, type: /元素重疊/, reason: "图片卡片的「复制」小按钮故意浮在整张卡片按钮上" });

const SIZES = {
  normal: { width: 680, height: 620 },
  mini: { width: 360, height: 440 },
};

const cases = [];
for (const platform of ["win32", "darwin"]) for (const theme of ["light", "dark"]) for (const size of ["normal", "mini"]) cases.push({ platform, theme, size });

for (const { platform, theme, size } of cases) {
  test(`layout guard: ${platform} ${theme} ${size}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ viewport: SIZES.normal, locale: "zh-CN", colorScheme: theme });
    const page = await ctx.newPage();
    page.setDefaultTimeout(5000);
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.addInitScript((t) => { try { localStorage.setItem("clipbox.theme", t); } catch { /* optional */ } }, theme);
    await asDesktop(page, platform);
    await seedSnippets(page);
    page.setDefaultTimeout(5000);

    const found = []; // { state, type, el, detail }
    const skipped = [];
    const search = () => page.getByPlaceholder(/搜索/).first();
    const press2 = async () => { for (let i = 0; i < 2; i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(120); } };
    const settingsBtn = () => page.getByRole("button", { name: /^设置$/ });
    const tabs = () => page.locator("[role=dialog] [role=tab]");

    // Esc does not close every dialog (known issue); close whatever stays open so the next step is not blocked.
    const closeLeftovers = async () => {
      for (let i = 0; i < 3; i++) {
        const open = page.locator("[role=dialog]:visible").last();
        if (!(await open.count())) return;
        await open.getByRole("button", { name: /^(关闭|取消|关闭设置|稍后)$|关闭/ }).first().click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(200);
      }
      if (await page.locator("[role=dialog]:visible").count()) await page.reload().then(() => page.waitForSelector(".app-shell"));
    };
    async function state(name, fn, { optional = false } = {}) {
      try { await fn(); } catch (e) {
        if (optional) { skipped.push(`${name}: ${e.message.split("\n")[0]}`); await press2(); return; }
        found.push({ state: name, type: "步骤失败", el: "-", detail: e.message.split("\n")[0].slice(0, 120) });
        await press2(); return;
      }
      await page.waitForTimeout(450);
      const issues = await page.evaluate(DETECT);
      for (const i of issues) found.push({ state: name, ...i });
      await press2(); await closeLeftovers();
    }

    const addImages = async () => {
      const [ch] = await Promise.all([page.waitForEvent("filechooser", { timeout: 4000 }), page.getByRole("button", { name: /新增图片|添加/ }).first().click()]);
      await ch.setFiles([PNG, JPG]); await page.waitForTimeout(1500);
    };
    if (size === "mini") {
      // The mini window cannot add images ("回到完整窗口添加图片"), so add them in the full window first.
      await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click();
      await addImages();
      await page.locator(".kind-switch").getByRole("button", { name: "话术" }).click();
      await page.getByRole("button", { name: "迷你模式" }).click();
      await page.waitForTimeout(400);
      await page.setViewportSize(SIZES.mini);
      await page.waitForTimeout(800);
    }
    const mini = size === "mini";

    await state("list", async () => {});
    await state("row-open", async () => { await page.locator(".row-main").nth(2).click(); });
    // The mini window copies on click and shows variable chips only: there is no popup to open there.
    if (!mini) await state("variable-popup", async () => {
      await page.locator(".native-row .row-main").first().click(); await page.waitForTimeout(400);
      await page.locator(".native-row.selected input[data-var]").first().click();
    });
    await search().fill("");
    await state("search-long", async () => { await search().fill("Instagram Instagram Instagram 很长很长的搜索词测试 abcdefghijklmnop"); });
    await search().fill("");
    await state("search-empty", async () => { await search().fill("zzzz不存在"); });
    await search().fill("");

    if (!mini) {
      await state("new-folder", async () => { await page.getByRole("button", { name: "新建目录" }).first().click(); await page.keyboard.type("一个比较长的目录名称测试一下"); });
      await state("folder-menu", async () => { await page.locator(".nav-item").nth(3).hover(); await page.locator(".folder-more").first().click(); });
      await state("product-filter", async () => { await page.locator(".product-filter").first().click(); }, { optional: true });
      await state("select-mode", async () => { await page.getByRole("button", { name: "选择" }).first().click(); await page.waitForTimeout(300); });
      await page.keyboard.press("Escape");
      await state("new-item", async () => { await page.getByRole("button", { name: "新增条目" }).first().click(); });
      await state("edit-inline", async () => { await page.locator(".row-main").nth(1).click(); await page.waitForTimeout(300); await page.locator(".native-row.selected").getByRole("button", { name: "编辑" }).first().click(); });
      await state("more-menu", async () => { await page.locator(".row-main").nth(1).click(); await page.waitForTimeout(300); await page.getByRole("button", { name: /更多操作/ }).first().click(); });
      await state("trash", async () => { await page.getByRole("button", { name: "回收站" }).first().click(); });
      await page.locator(".nav-item").first().click().catch(() => {});

      // Settings is one scrolling page today; when it becomes tabs (#52) every tab is opened too.
      const dialog = () => page.locator(".settings-dialog");
      const openSettings = async () => { await settingsBtn().click(); await dialog().waitFor(); await page.waitForTimeout(400); };
      await openSettings();
      const tabNames = [...new Set((await tabs().allTextContents()).map((x) => x.trim()).filter(Boolean))];
      await press2();
      if (tabNames.length === 0) {
        await state("settings-top", openSettings);
        for (const h of ["外观", "数据", "回收站", "窗口", "AI", "关于"]) {
          await state(`settings-${h}`, async () => { await openSettings(); await dialog().locator("h3", { hasText: h }).first().scrollIntoViewIfNeeded(); }, { optional: true });
        }
      } else {
        for (const t of tabNames) await state(`settings-${t}`, async () => { await openSettings(); await tabs().filter({ hasText: t }).first().click(); });
      }
      await state("backup-export", async () => {
        await openSettings();
        if (tabNames.length) await tabs().filter({ hasText: "数据" }).first().click();
        await dialog().locator(".settings-row", { hasText: "导出话术备份" }).getByRole("button").first().click();
        await page.locator("#backup-title").waitFor();
      });
    }

    // 图片
    await state("images-empty", async () => { await page.locator(".kind-switch").getByRole("button", { name: "图片" }).click(); });
    await state("images-added", async () => { if (!mini) await addImages(); else await page.locator(".image-tile-main").first().waitFor(); });
    await state("images-open", async () => { await page.locator(".image-tile-main, .image-row").first().click(); });
    if (!mini) await state("images-new-folder", async () => { await page.getByRole("button", { name: "新建目录" }).first().click(); await page.keyboard.type("收款码很长的图片目录名"); });

    if (platform === "darwin") {
      await state("secrets", async () => { await page.locator(".kind-switch").getByRole("button", { name: "秘密" }).click(); });
      if (!mini) {
        // 验证码 lives inside the 保险箱, which is the 秘密 page itself.
        await state("totp-add", async () => {
          const vault = page.getByRole("region", { name: "保险箱" });
          await vault.waitFor();
          await vault.getByRole("button", { name: "验证码", exact: true }).click();
          await vault.getByRole("button", { name: "添加账号" }).click();
        });
      }
    }

    const real = [], known = [];
    for (const f of found) {
      if (BY_DESIGN.some((x) => x.el.test(f.el) && x.type.test(f.type))) continue;
      const k = f.type === "步骤失败" ? null : KNOWN.find((x) => x.state.test(f.state) && x.type.test(f.type));
      (k ? known : real).push(f);
    }
    const fmt = (f) => `[${f.state}] ${f.type}：${f.el}${f.by ? " ← " + f.by : ""} ${f.detail ?? ""}`;
    if (known.length) console.log(`已知问题（白名单）${platform} ${theme} ${size}: ${known.length} 个\n` + known.map(fmt).join("\n"));
    if (skipped.length) console.log("跳过的步骤:\n" + skipped.join("\n"));
    expect(pageErrors, "页面不应抛出脚本错误").toEqual([]);
    expect(real.map(fmt), "界面排版问题").toEqual([]);
    await ctx.close();
  });
}
