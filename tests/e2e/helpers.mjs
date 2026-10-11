import { fileURLToPath } from "node:url";

export const SAMPLE_CSV = fileURLToPath(new URL("../../docs/samples/clipbox-test-snippets.csv", import.meta.url));

// Imports the 37-row sample sheet (2 invalid rows, 1 duplicate) → 34 snippets.
export async function seedSnippets(page) {
  await page.goto("/");
  await page.waitForSelector(".app-shell");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /导入话术表格/ }).first().click(),
  ]);
  await chooser.setFiles(SAMPLE_CSV);
  await page.locator("[role=dialog]").getByRole("button", { name: /导入 \d+ 条/ }).click();
  await page.waitForSelector(".native-row");
  await page.waitForTimeout(2500); // list entrance animation
}

// Pretends to be the desktop app on a given platform ("win32" | "darwin").
// `imageView: "list"` starts the 图片 section in the list view (the default is the grid), for tests about list rows.
export async function asDesktop(page, platform, { imageView } = {}) {
  if (imageView) await page.addInitScript((view) => { try { localStorage.setItem("clipbox.image-view", view); } catch { /* optional */ } }, imageView);
  await page.addInitScript((pl) => {
    // The 保险箱 examples go in on first open; tests start without them unless they clear this.
    try { localStorage.setItem("clipbox.vault.samples.v2", "1"); } catch { /* optional */ }
    window.clipboxDesktop = {
      platform: pl,
      copyText: async (text) => { window.__copied = text; },
      copyImage: async (png) => { window.__copiedImage = Array.from(png.slice(0, 8)); window.__copiedImageLength = png.length; },
      didCopy() {},
      getVersion: async () => "0.0.0-test",
      getBuildTime: async () => "2026-10-10T21:37:00",
      onFocusSearch: () => () => {},
      onAutomationCommand: () => () => {},
      respondAutomationCommand() {},
      automationReady() {},
      aiStatus: async () => ({ hasKey: false, origin: "" }),
    };
    document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add("desktop-app", `platform-${pl}`));
  }, platform);
}

// 账号 page (Mac): the sidebar 分类 list and the toolbar 新增 button.
export async function openAccountCategory(page, name) {
  await page.getByRole("navigation", { name: "分类" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
}
export const accountAddButton = (page) => page.getByRole("button", { name: "新增条目" });
