// The app version follows the trial version: tools/preview/VERSION "1.43" → app "1.43.0" (D-036).
// From 2.00 on the hundredths go in the last part, so the installer reads like the preview (owner, 2026-10-16):
// "2.00" → "2.0.0", "2.03" → "2.0.3", "2.10" → "2.0.10". An app version needs three numbers without leading zeros.
// Only the preview publisher (【話術】) changes VERSION; builds run this so package.json, Cargo.toml and
// Cargo.lock carry the same number as the installer. Run: node scripts/sync-version.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function appVersionFrom(trialVersion) {
  const match = /^(\d+)\.(\d+)$/.exec(String(trialVersion).trim());
  if (!match) throw new Error(`tools/preview/VERSION must look like 1.43, got "${String(trialVersion).trim()}"`);
  const major = Number(match[1]);
  if (major < 2) return `${major}.${Number(match[2])}.0`;
  return `${major}.0.${Number(match[2].padEnd(2, "0"))}`;
}

// The other way round, for an installer that only says its app version: "1.67.0" → "1.67", "2.0.3" → "2.03".
// A 2.x version with a non-zero middle part ("2.3.0", one private build on 2026-10-16) still reads the old way: "2.03".
export function previewFromApp(appVersion) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(appVersion).trim());
  if (!match) throw new Error(`an app version looks like 1.67.0, got "${String(appVersion).trim()}"`);
  const [, major, minor, patch] = match;
  if (Number(major) >= 2 && Number(minor) === 0) return `${major}.${patch.padStart(2, "0")}`;
  return `${major}.${minor.padStart(2, "0")}`;
}

// Replaces the first `version = "…"` that follows `anchor` (a pattern for the [package] header or the clipbox entry in Cargo.lock).
// Line endings are kept as they are: a Windows checkout has \r\n.
export function withCargoVersion(source, anchor, version) {
  const start = source.search(anchor);
  if (start < 0) throw new Error(`${anchor} not found`);
  const rest = source.slice(start).replace(/^version = "[^"]*"$/m, `version = "${version}"`);
  return source.slice(0, start) + rest;
}

export function syncVersion(root = new URL("../", import.meta.url)) {
  const read = (path) => readFileSync(new URL(path, root), "utf8");
  const write = (path, text) => writeFileSync(new URL(path, root), text);
  const version = appVersionFrom(read("tools/preview/VERSION"));
  const pkg = JSON.parse(read("package.json"));
  if (pkg.version !== version) write("package.json", read("package.json").replace(/^(\s*"version": ")[^"]*(",?)$/m, `$1${version}$2`));
  const lockfile = JSON.parse(read("package-lock.json"));
  if (lockfile.version !== version || lockfile.packages?.[""]?.version !== version) {
    lockfile.version = version;
    if (lockfile.packages?.[""]) lockfile.packages[""].version = version;
    write("package-lock.json", `${JSON.stringify(lockfile, null, 2)}\n`);
  }
  write("src-tauri/Cargo.toml", withCargoVersion(read("src-tauri/Cargo.toml"), /\[package\]/, version));
  write("src-tauri/Cargo.lock", withCargoVersion(read("src-tauri/Cargo.lock"), /name = "clipbox"\r?\n/, version));
  return version;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(`app version ${syncVersion()}`);
