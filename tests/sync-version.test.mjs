import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { appVersionFrom, withCargoVersion } from "../scripts/sync-version.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the app version is the trial version with .0 added", () => {
  assert.equal(appVersionFrom("1.43"), "1.43.0");
  assert.equal(appVersionFrom("1.43\n"), "1.43.0");
  assert.equal(appVersionFrom(" 2.5 "), "2.5.0");
  assert.throws(() => appVersionFrom("1.43.2"), /must look like/);
  assert.throws(() => appVersionFrom("v1"), /must look like/);
});

test("only the package's own version line is rewritten in Cargo files", () => {
  const toml = '[package]\nname = "clipbox"\nversion = "0.2.24"\n\n[dependencies]\ntauri = { version = "2" }\nurl = "2"\n';
  assert.equal(withCargoVersion(toml, "[package]", "1.43.0"), toml.replace("0.2.24", "1.43.0"));
  const lock = 'name = "a"\nversion = "1.0.0"\n\n[[package]]\nname = "clipbox"\nversion = "0.2.24"\n\n[[package]]\nname = "z"\nversion = "9.9.9"\n';
  const out = withCargoVersion(lock, 'name = "clipbox"\n', "1.43.0");
  assert.match(out, /name = "clipbox"\nversion = "1\.43\.0"/);
  assert.match(out, /name = "a"\nversion = "1\.0\.0"/);
  assert.match(out, /name = "z"\nversion = "9\.9\.9"/);
});

test("package.json, Cargo.toml and Cargo.lock agree, and builds sync them from tools/preview/VERSION", () => {
  const version = JSON.parse(read("package.json")).version;
  assert.match(read("src-tauri/Cargo.toml"), new RegExp(`^version = "${version.replaceAll(".", "\\.")}"$`, "m"));
  assert.match(read("src-tauri/Cargo.lock"), new RegExp(`name = "clipbox"\\nversion = "${version.replaceAll(".", "\\.")}"`));
  assert.match(JSON.parse(read("package.json")).scripts["tauri:build"], /sync-version\.mjs/);
  assert.match(read(".github/workflows/tauri.yml"), /node scripts\/sync-version\.mjs/);
});
