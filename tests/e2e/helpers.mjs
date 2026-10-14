import { fileURLToPath } from "node:url";

export const SAMPLE_CSV = fileURLToPath(new URL("../../docs/samples/clipbox-test-snippets.csv", import.meta.url));

// The first-run guide (app/first-run-guide.tsx) covers the window on a fresh start. playwright.config.mjs starts every
// test with it already seen (this storage state); a test about the guide uses `test.use({ storageState: GUIDE_UNSEEN })`.
export const FIRST_RUN_GUIDE_KEY = "clipbox.first-run-guide.v1";
// The 账号 page is frosted until slid open (D-051, on by default). The shared state turns that off, so tests about the
// 账号 content reach it at once; tests about the slide itself use `test.use({ storageState: SLIDE_UNLOCK_ON })`.
export const SLIDE_UNLOCK_KEY = "clipbox.account-slide-unlock.v1";
export function guideSeenState(baseURL, { slideUnlock = false } = {}) {
  const localStorage = [{ name: FIRST_RUN_GUIDE_KEY, value: "1" }];
  if (!slideUnlock) localStorage.push({ name: SLIDE_UNLOCK_KEY, value: "0" });
  return { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage }] };
}
// Guide seen, slide unlock left at its default (on), as on a real install.
export const SLIDE_UNLOCK_ON = async ({ baseURL }, provide) => { await provide(guideSeenState(baseURL, { slideUnlock: true })); };
export const GUIDE_UNSEEN = { cookies: [], origins: [] };

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
  // Wait for the list entrance animation (rows slide in one after another) instead of a fixed pause.
  // Endless animations (a spinner) never finish, so they are left out.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity));
  // The "已导入 … 条话术" toast may still show; a newer toast replaces it together with its timer (app/use-toast.ts).
}

// Waits until nothing on the page moves: every finite animation has finished and no element's box changed between two
// checks 50 ms apart (this also covers spring motion and scrolling, which document.getAnimations() does not list).
export async function settle(page) {
  await page.evaluate(() => { window.__settleShot = undefined; });
  await page.waitForFunction(() => {
    if (document.getAnimations().some((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity)) return false;
    const shot = Array.from(document.querySelectorAll("body *"), (el) => { const r = el.getBoundingClientRect(); return `${r.x},${r.y},${r.width},${r.height}`; }).join(";");
    const same = shot === window.__settleShot;
    window.__settleShot = shot;
    return same;
  }, null, { polling: 50 });
}

// Pretends to be the desktop app on a given platform ("win32" | "darwin").
// `imageView: "list"` starts the 图片 section in the list view (the default is the grid), for tests about list rows.
// testTools: act as the web preview, which shows 导入测试内容 / 清除测试内容 (the installed app never does).
export async function asDesktop(page, platform, { imageView, testTools = false } = {}) {
  if (imageView) await page.addInitScript((view) => { try { localStorage.setItem("clipbox.image-view", view); } catch { /* optional */ } }, imageView);
  await page.addInitScript(([pl, tools]) => {
    // The 保险箱 examples go in on first open; tests start without them unless they clear this.
    try { localStorage.setItem("clipbox.vault.samples.v2", "1"); } catch { /* optional */ }
    window.clipboxDesktop = {
      platform: pl,
      ...(tools ? { testTools: true } : {}),
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
      // 固定在最上层: every value the page sends is kept in order, for tests to read.
      setPinned(pinned) { (window.__pinCalls ??= []).push(pinned); },
    };
    document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add("desktop-app", `platform-${pl}`));
  }, [platform, testTools]);
}

// 账号 page (Mac): the sidebar 分类 list and the toolbar 新增 button.
export async function openAccountCategory(page, name) {
  await page.getByRole("navigation", { name: "分类" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
}
export const accountAddButton = (page) => page.getByRole("button", { name: "新增条目" });

// Notes what changes inside `scope` from the moment the page loads: text that appears and the class / aria-label values
// an element gets. A short-lived state (a "已复制" that is gone after a second) can then be checked from what was shown,
// instead of by catching it on screen, which a busy machine can make a poll miss. Call before page.goto.
export async function recordChanges(page, scope) {
  await page.addInitScript((selector) => {
    window.__changes = [];
    const inScope = (node) => (node instanceof Element ? node : node.parentElement)?.closest(selector);
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") { if (inScope(record.target)) window.__changes.push(`${record.attributeName}=${record.target.getAttribute(record.attributeName)}`); continue; }
        for (const node of record.addedNodes) {
          if (!inScope(node)) continue;
          window.__changes.push(`text=${node.textContent ?? ""}`);
          if (node instanceof Element) for (const element of [node, ...node.querySelectorAll("[class],[aria-label]")]) for (const name of ["class", "aria-label"]) if (element.hasAttribute(name)) window.__changes.push(`${name}=${element.getAttribute(name)}`);
        }
      }
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-label"] });
  }, scope);
}
export const changesSeen = (page) => page.evaluate(() => window.__changes);
