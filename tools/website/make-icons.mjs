// Writes the website's icons into tools/website/icons/ (committed; run by hand when the app icon changes):
//   node tools/website/make-icons.mjs
// - apple-touch-icon.png (180), icon-192.png, icon-512.png: the app icon src-tauri/icons/icon.png, scaled down in
//   Chromium (halving steps with high-quality smoothing, so the edges stay sharp).
// - favicon.ico (16, 32, 48): drawn from icons/favicon.svg, a copy of the brand icon docs/brand/icon-mark.svg;
//   the entries are PNGs inside the ICO container.
// - og-image.png (1200×630): the share card, a screenshot of og-image.html at device scale 1.
// Needs Playwright's Chromium (installed with the dev dependencies; `npx playwright install chromium` otherwise).
import { chromium } from "@playwright/test";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const iconsDir = join(here, "icons");
const appIcon = join(repo, "src-tauri/icons/icon.png");
const faviconSvg = join(iconsDir, "favicon.svg");

const pngSizes = { "apple-touch-icon.png": 180, "icon-192.png": 192, "icon-512.png": 512 };
const icoSizes = [16, 32, 48];

// An ICO file: 6-byte header, one 16-byte directory entry per image, then the PNG data of each image.
export function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // no palette
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

function dataUrl(file, type) {
  return `data:${type};base64,${readFileSync(file).toString("base64")}`;
}

// Runs in the page: draws `src` at `size`×`size` and returns the PNG as base64. A raster source is halved step by
// step (each step with high-quality smoothing) so a 1024 px icon does not alias down to 16 px in one jump.
async function renderInPage({ src, size }) {
  const image = new Image();
  image.src = src;
  await image.decode();
  let canvas = document.createElement("canvas");
  let width = image.naturalWidth || size;
  if (src.startsWith("data:image/svg")) width = size;
  canvas.width = canvas.height = width;
  let ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, width);
  while (width > size) {
    const next = Math.max(size, Math.floor(width / 2));
    const smaller = document.createElement("canvas");
    smaller.width = smaller.height = next;
    const c = smaller.getContext("2d");
    c.imageSmoothingQuality = "high";
    c.drawImage(canvas, 0, 0, next, next);
    canvas = smaller;
    ctx = c;
    width = next;
  }
  return canvas.toDataURL("image/png").split(",")[1];
}

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><title>icons</title>");
    const written = [];

    const iconSrc = dataUrl(appIcon, "image/png");
    for (const [name, size] of Object.entries(pngSizes)) {
      const base64 = await page.evaluate(renderInPage, { src: iconSrc, size });
      writeFileSync(join(iconsDir, name), Buffer.from(base64, "base64"));
      written.push(name);
    }

    const svgSrc = dataUrl(faviconSvg, "image/svg+xml");
    const icoImages = [];
    for (const size of icoSizes) {
      const base64 = await page.evaluate(renderInPage, { src: svgSrc, size });
      icoImages.push({ size, png: Buffer.from(base64, "base64") });
    }
    writeFileSync(join(iconsDir, "favicon.ico"), buildIco(icoImages));
    written.push("favicon.ico");

    // Chromium must be able to decode the ICO, or browsers will show no tab icon.
    const icoUrl = pathToFileURL(join(iconsDir, "favicon.ico")).href;
    const icoPage = await browser.newPage();
    await icoPage.goto(pathToFileURL(join(here, "og-image.html")).href);
    const decoded = await icoPage.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return image.naturalWidth;
    }, icoUrl);
    if (!icoSizes.includes(decoded)) throw new Error(`favicon.ico did not decode (width ${decoded}).`);
    await icoPage.close();

    const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await og.goto(pathToFileURL(join(here, "og-image.html")).href);
    await og.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((image) => image.decode())]));
    await og.screenshot({ path: join(iconsDir, "og-image.png") });
    written.push("og-image.png");

    for (const name of written) console.log(`${name.padEnd(22)} ${statSync(join(iconsDir, name)).size} bytes`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
