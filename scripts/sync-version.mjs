// The app version follows the trial version: tools/preview/VERSION "1.43" → app "1.43.0" (D-036).
// Only the preview publisher (【話術】) changes VERSION; builds run this so package.json, Cargo.toml and
// Cargo.lock carry the same number as the installer. Run: node scripts/sync-version.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function appVersionFrom(trialVersion) {
  const match = /^(\d+)\.(\d+)$/.exec(String(trialVersion).trim());
  if (!match) throw new Error(`tools/preview/VERSION must look like 1.43, got "${String(trialVersion).trim()}"`);
  return `${match[1]}.${match[2]}.0`;
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
