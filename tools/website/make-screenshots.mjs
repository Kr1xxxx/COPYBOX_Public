// Takes the app screenshots for the website into tools/website/images/ (committed; run by hand when the UI changes):
//   npm run build && npm run preview:build && node tools/website/make-screenshots.mjs
// Serves dist-preview/ with tools/preview/serve.mjs on a free port and opens the preview page. The 话术 come from
// showcase-snippets.csv (made-up, general customer-service replies: no real customers, products or accounts),
// imported through the app's own import dialog; the ten test images come from the page's 补齐 10 张测试图 button.
// The shots are recoloured white and purple to match the website (owner, 2026-10-14: the app's brick red made the
// site look like a second product): showcaseStyle overrides the app's colour tokens. The app frame (#app, 680×620) is
// captured at device scale 2 (the 图片 grid at 1.5: the browser profile lives in a temporary folder and is opened a
// second time at that scale, so the seeded data is still there). The demo "有新版本 9.9.9" banner of the preview is put away with its own 稍后 button
// first, and the 已导入 notice is left to fade out.
//   app-win-light.png   话术 list, light theme
//   app-win-dark.png    话术 list, dark theme (the app follows the system theme)
//   app-images-light.png  the 图片 grid (device scale 1.5: the photos make a scale-2 PNG too big)
//   app-mini-light.png  the mini window (360×440)
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const outDir = join(here, "images");
const scale = 2;
const imagesScale = 1.5;
const maxBytes = 400 * 1024;

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

function startServer(port) {
  const child = spawn(process.execPath, [join(repo, "tools/preview/serve.mjs"), String(port)], { stdio: ["ignore", "pipe", "inherit"] });
  return new Promise((resolveStart, reject) => {
    const timer = setTimeout(() => reject(new Error("Preview server did not start.")), 10000);
    child.once("exit", (code) => reject(new Error(`Preview server exited (${code}).`)));
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Preview:")) {
        clearTimeout(timer);
        resolveStart(child);
      }
    });
  });
}

// The app inside the preview page's frame.
function appFrame(page) {
  const frame = page.frames().find((f) => /\/app-(win|mac)\.html/.test(f.url()));
  if (!frame) throw new Error("App frame not found.");
  return frame;
}

const showcaseCsv = join(here, "showcase-snippets.csv");

// The website's purple (site.css --accent) on white and neutral grey, light and dark.
const showcaseStyle = `
:root { --bg: #ffffff; --sidebar: #f6f6f8; --card: #ffffff; --content: #fafafb; --fill: #ececf0; --hover: #f1f1f4; --line: #e7e7ec;
  --line-soft: #efeff3; --border: #e2e2e8; --accent: #6f67c9; --accent-hover: #5f57b8; --accent-soft: #e9e6fb; --accent-tint: #efedfc;
  --accent-ink: #4b449f; --star: #6f67c9; --ring: rgba(111, 103, 201, .18); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #16171b; --sidebar: #121316; --card: #1f2025; --content: #1a1b1f;
  --fill: #2c2d33; --hover: #24252b; --line: #303138; --line-soft: #26272d; --border: #393a42; --accent: #8f87e6; --accent-hover: #a39cf0;
  --accent-soft: #2f2b57; --accent-tint: #26234a; --accent-ink: #cdc8ff; --star: #a39cf0; --ring: rgba(163, 156, 240, .28); } }
`;

async function recolor(frame) {
  await frame.evaluate((css) => {
    let style = document.getElementById("website-showcase");
    if (!style) {
      style = document.createElement("style");
      style.id = "website-showcase";
      document.head.append(style);
    }
    style.textContent = css;
  }, showcaseStyle);
}

// Imports showcase-snippets.csv with the app's import dialog (once per profile).
async function importShowcase(frame) {
  if (await frame.locator(".native-row").count()) return;
  await frame.locator("input[type=file][accept*='.csv']").first().setInputFiles(showcaseCsv);
  await frame.locator(".snippet-dialog-actions button.primary").click();
  await frame.waitForFunction(() => document.querySelectorAll(".native-row").length >= 10, null, { timeout: 30000 });
}

// The page's 补齐 10 张测试图 button (made-up pictures drawn in the browser).
async function seedImages(page) {
  await page.locator("#reseed").click();
  await page.waitForFunction(() => document.getElementById("busy").hidden && !document.getElementById("reseed").disabled, null, { timeout: 120000, polling: 250 });
}

async function showKind(frame, label) {
  await frame.locator(".kind-switch button", { hasText: label }).first().click();
  await frame.locator(".kind-switch button[aria-pressed=true]", { hasText: label }).first().waitFor();
}

// Opens the preview page, waits for the seeding and puts away the demo update banner and the import notice.
async function openPreview(context, port) {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => [...document.querySelectorAll("iframe")].some((f) => f.contentDocument?.querySelector(".app-shell")), null, { timeout: 30000 });
  const frame = appFrame(page);
  await frame.locator(".app-shell").waitFor();
  const later = frame.locator(".update-banner button", { hasText: "稍后" });
  if (await later.count()) await later.first().click();
  await frame.locator(".update-banner").waitFor({ state: "detached" });
  const skip = frame.locator(".guide-skip");
  if (await skip.count()) await skip.first().click();
  await frame.locator(".guide-backdrop").waitFor({ state: "detached" });
  await recolor(frame);
  return { page, frame };
}

// Every <img> in the frame has loaded, fonts are ready, and no transition is still running.
async function settle(page) {
  await page.mouse.move(0, 0);
  const frame = appFrame(page);
  await frame.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => (image.complete ? null : image.decode().catch(() => null))));
    await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null)));
  });
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null))));
  await page.waitForTimeout(400);
}

async function shoot(page, name) {
  await settle(page);
  const path = join(outDir, name);
  await page.locator("#app").screenshot({ path, animations: "disabled", caret: "hide" });
  const size = statSync(path).size;
  console.log(`${name.padEnd(22)} ${size} bytes`);
  if (size > maxBytes) console.warn(`  ${name} is over ${maxBytes} bytes; lower \`scale\` in make-screenshots.mjs.`);
}

async function main() {
  if (!existsSync(join(repo, "dist-preview/index.html"))) {
    throw new Error("dist-preview/ is missing: run npm run build && npm run preview:build first.");
  }
  mkdirSync(outDir, { recursive: true });
  const port = await freePort();
  const server = await startServer(port);
  const profile = mkdtempSync(join(tmpdir(), "clipboxx-shots-"));
  let context = null;
  try {
    const options = { viewport: { width: 1280, height: 900 }, colorScheme: "light", locale: "zh-CN" };
    context = await chromium.launchPersistentContext(profile, { ...options, deviceScaleFactor: scale });
    const { page, frame } = await openPreview(context, port);

    await showKind(frame, "话术");
    await importShowcase(frame);
    await frame.getByText(/已导入 \d+ 条话术/).waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    await frame.waitForFunction(() => document.querySelectorAll(".native-row").length >= 5, null, { timeout: 30000 });
    await shoot(page, "app-win-light.png");

    await page.emulateMedia({ colorScheme: "dark" });
    await shoot(page, "app-win-dark.png");
    await page.emulateMedia({ colorScheme: "light" });

    await frame.getByRole("button", { name: "迷你模式" }).first().click();
    await page.waitForFunction(() => document.getElementById("win").dataset.mode === "mini");
    await frame.waitForFunction(() => document.querySelectorAll(".mini-row").length >= 3, null, { timeout: 30000 });
    await recolor(appFrame(page));
    await shoot(page, "app-mini-light.png");

    await context.close();
    context = await chromium.launchPersistentContext(profile, { ...options, deviceScaleFactor: imagesScale });
    const images = await openPreview(context, port);
    await seedImages(images.page);
    images.frame = appFrame(images.page);
    await recolor(images.frame);
    await showKind(images.frame, "图片");
    await images.frame.waitForFunction(() => document.querySelectorAll(".image-tile img").length >= 10, null, { timeout: 30000 });
    await shoot(images.page, "app-images-light.png");
  } finally {
    await context?.close();
    server.kill();
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
