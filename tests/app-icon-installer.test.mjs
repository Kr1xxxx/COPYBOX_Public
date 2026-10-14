import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { cropToTile, encodeBmp24, encodeIco, ICO_SIZES, readBmpInfo, readIcoSizes, SIDEBAR } from "../scripts/render-icons.mjs";

// D-046: product name Copyboxx, Chinese installer, brand pictures instead of NSIS's stock ones, new icon.
const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
const nsis = conf.bundle.windows.nsis;

test("installed app is named Copyboxx; the identifier that keys the data stays com.clipbox.tauri", () => {
  assert.equal(conf.productName, "Copyboxx");
  assert.equal(conf.identifier, "com.clipbox.tauri");
  assert.equal(conf.bundle.publisher, "Copyboxx");
  // Without a copyright NSIS shows "Nullsoft Install System v3.x" at the bottom of every installer page.
  assert.ok(conf.bundle.copyright?.trim(), "bundle.copyright must not be empty");
});

test("the Windows installer is in Chinese only, with no language picker", () => {
  assert.deepEqual(nsis.languages, ["SimpChinese"]);
  assert.equal(nsis.displayLanguageSelector, false);
  assert.equal(nsis.installMode, "currentUser");
});

test("the installer uses the app icon and the brand sidebar, not NSIS's stock pictures", () => {
  for (const key of ["installerIcon", "uninstallerIcon", "sidebarImage"]) {
    assert.ok(nsis[key], `${key} is set`);
    assert.ok(existsSync(new URL(`src-tauri/${nsis[key]}`, root)), `${nsis[key]} exists`);
  }
  assert.equal(nsis.installerIcon, "icons/icon.ico");
  // MUI2's welcome/finish picture: 164×314, uncompressed 24-bit (NSIS refuses other formats at build time).
  assert.deepEqual(readBmpInfo(read(`src-tauri/${nsis.sidebarImage}`)), { width: SIDEBAR.width, height: SIDEBAR.height, bitsPerPixel: 24, compression: 0 });
});

test("icon files: the three tauri.conf.json lists exist, the .ico carries every Windows size", () => {
  assert.deepEqual(conf.bundle.icon, ["icons/icon.png", "icons/icon.ico", "icons/icon.icns"]);
  const png = read("src-tauri/icons/icon.png");
  assert.equal(png.toString("ascii", 1, 4), "PNG");
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1024, 1024]);
  assert.equal(png[25], 6, "icon.png has an alpha channel (transparent margin)");
  assert.deepEqual(readIcoSizes(read("src-tauri/icons/icon.ico")), ICO_SIZES);
  assert.equal(read("src-tauri/icons/icon.icns").toString("ascii", 0, 4), "icns");
  for (const svg of ["icon.svg", "icon-16.svg", "icon-24.svg"]) assert.match(read(`src-tauri/icons/${svg}`).toString(), /^<svg /);
});

test("BMP writer: bottom-up rows padded to four bytes, BGR order", () => {
  // 2×2: red, green / blue, white.
  const rgba = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
  const bmp = encodeBmp24(2, 2, rgba);
  assert.deepEqual(readBmpInfo(bmp), { width: 2, height: 2, bitsPerPixel: 24, compression: 0 });
  assert.equal(bmp.length, 54 + 8 * 2);
  assert.deepEqual([...bmp.subarray(54, 62)], [255, 0, 0, 255, 255, 255, 0, 0], "first stored row is the bottom one");
  assert.deepEqual([...bmp.subarray(62, 70)], [0, 0, 255, 0, 255, 0, 0, 0]);
  assert.throws(() => encodeBmp24(2, 2, new Uint8Array(4)), /does not match/);
});

test("ICO writer: one directory entry per size, 256 written as 0, offsets point at the images", () => {
  const ico = encodeIco([{ size: 16, png: Buffer.from("aaaa") }, { size: 256, png: Buffer.from("bbbbbb") }]);
  assert.deepEqual(readIcoSizes(ico), [16, 256]);
  assert.equal(ico[6 + 16], 0);
  const offset = ico.readUInt32LE(6 + 16 + 12);
  assert.equal(ico.subarray(offset, offset + 6).toString(), "bbbbbb");
});

test("Windows sizes use the tile without the macOS margin", () => {
  const svg = read("src-tauri/icons/icon.svg").toString();
  assert.match(svg, /viewBox="0 0 1024 1024"/);
  assert.match(cropToTile(svg), /viewBox="100 100 824 824"/);
  assert.match(svg, /<rect x="100" y="100" width="824" height="824"/, "the tile sits where cropToTile expects it");
});
