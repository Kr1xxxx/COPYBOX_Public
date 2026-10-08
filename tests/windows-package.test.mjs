import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("configures a per-user Windows x64 NSIS installer", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.equal(pkg.version, "0.2.24");
  assert.equal(pkg.dependencies.react, "19.2.8");
  assert.equal(pkg.dependencies["react-dom"], "19.2.8");
  assert.equal(pkg.devDependencies.electron, "44.0.0");
  assert.equal(pkg.devDependencies["electron-builder"], "26.15.3");
  assert.equal(pkg.devDependencies["@vitejs/plugin-rsc"], "0.5.34");
  assert.equal(pkg.devDependencies["@cloudflare/vite-plugin"], "1.54.0");
  assert.equal(pkg.devDependencies["react-server-dom-webpack"], "19.2.8");
  assert.equal(pkg.devDependencies.vinext, "1.0.0-beta.8");
  assert.equal(pkg.devDependencies.vite, "8.2.2");
  assert.equal(pkg.devDependencies.wrangler, "4.126.0");
  assert.equal(pkg.scripts["desktop:pack"], pkg.scripts["desktop:pack:mac"]);
  assert.match(pkg.scripts["desktop:pack:win"], /electron-builder --win nsis --x64/);
  assert.equal(pkg.build.win.icon, "desktop/assets/Clipbox.ico");
  assert.deepEqual(pkg.build.win.target, [{ target: "nsis", arch: ["x64"] }]);
  assert.equal(pkg.build.nsis.oneClick, true);
  assert.equal(pkg.build.nsis.perMachine, false);
  assert.equal(pkg.build.nsis.createStartMenuShortcut, true);
  assert.equal(pkg.build.nsis.createDesktopShortcut, true);
  assert.equal(pkg.build.nsis.shortcutName, "Clipbox");
  assert.equal(pkg.build.nsis.artifactName, "Clipbox-Setup-${version}-${arch}.${ext}");
  assert.equal(pkg.build.compression, "maximum");
  assert.deepEqual(pkg.build.electronLanguages, ["zh-CN", "en-US"]);
  assert.ok(pkg.build.files.includes("!node_modules/**/*"));
});

test("packages a server entry that proves port ownership over child IPC", async () => {
  const prepareScript = await readFile(new URL("../desktop/prepare-standalone.mjs", import.meta.url), "utf8");
  const serverScript = await readFile(new URL("../desktop/standalone-server.mjs", import.meta.url), "utf8");

  assert.match(serverScript, /clipbox:server-ready/);
  assert.match(serverScript, /CLIPBOX_SERVER_NONCE/);
  assert.match(serverScript, /result\.port/);
  assert.match(prepareScript, /pruneRuntimeArtifacts/);
});
