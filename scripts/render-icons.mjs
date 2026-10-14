// Renders the app icon files and the installer picture from the SVG sources (D-046):
//   node scripts/render-icons.mjs
// Uses Playwright's Chromium (a dev dependency) to draw the SVGs and `tauri icon` for the .icns. Writes into
// src-tauri/icons/:
//   icon.png               1024 px, macOS style: the tile with a transparent margin (icon.svg as drawn)
//   icon.ico               16 and 24 px from icon-16.svg and icon-24.svg (drawn on the pixel grid); 32, 48, 64
//                          and 256 px from icon.svg cropped to the tile
//   icon.icns              from icon.png
//   installer-sidebar.bmp  164×314, 24-bit: the picture on the installer's first and last page
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const icons = join(repo, "src-tauri/icons");

export const ICO_SIZES = [16, 24, 32, 48, 64, 256];
export const SIDEBAR = { width: 164, height: 314, background: "#F4F2FA", ink: "#262628", iconSize: 84 };

// A bottom-up, uncompressed 24-bit BMP (what NSIS's welcome/finish page expects) from RGBA pixels on an opaque
// background (alpha is ignored).
export function encodeBmp24(width, height, rgba) {
  if (rgba.length !== width * height * 4) throw new Error("pixel data does not match the size");
  const stride = Math.ceil((width * 3) / 4) * 4;
  const offset = 14 + 40;
  const out = Buffer.alloc(offset + stride * height);
  out.write("BM", 0, "ascii");
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(offset, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(0, 30);
  out.writeUInt32LE(stride * height, 34);
  out.writeInt32LE(2835, 38);
  out.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y += 1) {
    const row = offset + (height - 1 - y) * stride;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      out[row + x * 3] = rgba[i + 2];
      out[row + x * 3 + 1] = rgba[i + 1];
      out[row + x * 3 + 2] = rgba[i];
    }
  }
  return out;
}

export function readBmpInfo(bmp) {
  if (bmp.toString("ascii", 0, 2) !== "BM") throw new Error("not a BMP");
  return { width: bmp.readInt32LE(18), height: bmp.readInt32LE(22), bitsPerPixel: bmp.readUInt16LE(28), compression: bmp.readUInt32LE(30) };
}

// An .ico whose entries are PNG images ([{ size, png }], largest last is fine; Windows picks by size).
export function encodeIco(entries) {
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size, png }, index) => {
    const at = 6 + index * 16;
    header[at] = size >= 256 ? 0 : size;
    header[at + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...entries.map((entry) => entry.png)]);
}

export function readIcoSizes(ico) {
  if (ico.readUInt16LE(2) !== 1) throw new Error("not an icon file");
  return Array.from({ length: ico.readUInt16LE(4) }, (_, index) => ico[6 + index * 16] || 256);
}

// icon.svg shows the tile with a macOS-style margin; Windows sizes use the tile alone so small icons stay large.
export function cropToTile(svg) {
  return svg.replace('viewBox="0 0 1024 1024"', 'viewBox="100 100 824 824"');
}

// Draws `svg` at size×size in the page and returns PNG bytes.
async function renderPng(page, svg, size) {
  const base64 = await page.evaluate(async ({ svg, size }) => {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace("<svg ", `<svg width="${size}" height="${size}" `))}`;
    await image.decode();
    const canvas = Object.assign(document.createElement("canvas"), { width: size, height: size });
    canvas.getContext("2d").drawImage(image, 0, 0, size, size);
    return canvas.toDataURL("image/png").split(",")[1];
  }, { svg, size });
  return Buffer.from(base64, "base64");
}

// The installer sidebar: plain background, the icon centred, 复制盒 under it.
async function renderSidebar(page, svg) {
  const pixels = await page.evaluate(async ({ svg, s }) => {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace("<svg ", `<svg width="${s.iconSize}" height="${s.iconSize}" `))}`;
    await image.decode();
    const canvas = Object.assign(document.createElement("canvas"), { width: s.width, height: s.height });
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = s.background;
    ctx.fillRect(0, 0, s.width, s.height);
    // Icon and name as one group, a little above the middle (optical centre).
    const gap = 16;
    const text = 20;
    const top = Math.round((s.height - (s.iconSize + gap + text)) / 2) - 12;
    ctx.drawImage(image, Math.round((s.width - s.iconSize) / 2), top, s.iconSize, s.iconSize);
    ctx.fillStyle = s.ink;
    ctx.font = `600 ${text}px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "WenQuanYi Zen Hei", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.letterSpacing = "3px";
    // letterSpacing adds space after the last character too; shift by half of it to stay centred.
    ctx.fillText("复制盒", s.width / 2 + 1.5, top + s.iconSize + gap);
    return Array.from(ctx.getImageData(0, 0, s.width, s.height).data);
  }, { svg, s: SIDEBAR });
  return encodeBmp24(SIDEBAR.width, SIDEBAR.height, Uint8Array.from(pixels));
}

export async function main() {
  const { chromium } = await import("playwright");
  const master = readFileSync(join(icons, "icon.svg"), "utf8");
  const tile = cropToTile(master);
  const fitted = { 16: readFileSync(join(icons, "icon-16.svg"), "utf8"), 24: readFileSync(join(icons, "icon-24.svg"), "utf8") };
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const png = await renderPng(page, master, 1024);
    writeFileSync(join(icons, "icon.png"), png);
    const entries = [];
    for (const size of ICO_SIZES) entries.push({ size, png: await renderPng(page, fitted[size] ?? tile, size) });
    writeFileSync(join(icons, "icon.ico"), encodeIco(entries));
    writeFileSync(join(icons, "installer-sidebar.bmp"), await renderSidebar(page, tile));
  } finally {
    await browser.close();
  }
  const temp = mkdtempSync(join(tmpdir(), "copyboxx-icon-"));
  try {
    const cli = join(repo, "node_modules/@tauri-apps/cli/tauri.js");
    execFileSync(process.execPath, [cli, "icon", join(icons, "icon.png"), "-o", temp], { stdio: "pipe" });
    writeFileSync(join(icons, "icon.icns"), readFileSync(join(temp, "icon.icns")));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  console.log("wrote icon.png, icon.ico, icon.icns and installer-sidebar.bmp in src-tauri/icons/");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
