// Builds the web preview (see README.md): node tools/preview/build.mjs [--out dist-preview]
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");

// "/_next/static" (also with escaped slashes, as inside the page's data) becomes the relative "assets/static".
export function relativizeAssets(text) {
  return text.replace(/(?:\\?\/)?_next(\\?\/)static/g, "assets$1static");
}

// The Vite preload helper builds dependency paths from "/"; make them relative to the chunk file.
export function patchPreloadHelper(js) {
  const pattern = /=function\(e\)\{return`\/`\+e\}/g;
  const count = (js.match(pattern) || []).length;
  if (count !== 1) throw new Error(`Preload helper patch must match exactly once, matched ${count} times.`);
  return js.replace(pattern, () => "=function(e){return new URL(`../../../`+e,import.meta.url).href}");
}

const platformLabels = { win32: "Windows", darwin: "macOS" };

export function withDesktopShim(html, platform) {
  const label = platformLabels[platform];
  if (!label) throw new Error(`Unknown platform: ${platform}`);
  const shim = `<script>
// Preview only: stands in for the desktop shell so the page looks and behaves like the real app on ${label}.
(function () {
  window.clipboxDesktop = {
    platform: "${platform}",
    copyText: function (text) { return navigator.clipboard.writeText(text); },
    copyImage: function (png) { return navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([png], { type: "image/png" }) })]); },
    didCopy: function () {},
    getVersion: function () { return Promise.resolve("网页测试版"); },
    onFocusSearch: function () { return function () {}; },
    onAutomationCommand: function () { return function () {}; },
    respondAutomationCommand: function () {},
    automationReady: function () {},
    aiStatus: function () { return Promise.resolve({ hasKey: false, origin: "" }); },
    setWindowMode: function (mode) { try { parent.postMessage({ clipbox: "window-mode", mode: mode }, "*"); } catch (e) {} },
    relaunch: function () { location.reload(); }
  };
  document.documentElement.classList.add("desktop-app", "platform-${platform}");
})();
</script>`;
  return html.replace("<head>", () => "<head>" + shim);
}

export function renderWrapper(template, version) {
  return template.replaceAll("__VERSION__", String(version).trim());
}

export function ensureTitle(html) {
  return html.includes("<title>") ? html : html.replace("<head>", "<head><title>Clipbox</title>");
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

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

async function fetchServerHtml() {
  const port = await freePort();
  const child = spawn(join(repo, "node_modules/.bin/vinext"), ["start"], {
    cwd: repo,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  let exited = false;
  child.once("exit", () => { exited = true; });
  try {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (exited) throw new Error("vinext start stopped early.");
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`);
        if (response.status === 200) return await response.text();
      } catch {
        // not listening yet
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("vinext start did not answer within 30 s.");
  } finally {
    child.kill();
  }
}

export async function main(argv = process.argv.slice(2)) {
  const outIndex = argv.indexOf("--out");
  const out = resolve(repo, outIndex >= 0 ? argv[outIndex + 1] : "dist-preview");
  const nextDir = join(repo, "dist/client/_next");
  if (!existsSync(nextDir)) {
    console.error('Run "npm run build" first.');
    process.exit(1);
  }

  const raw = await fetchServerHtml();

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(nextDir, join(out, "assets"), { recursive: true });

  let patched = 0;
  for (const file of walk(join(out, "assets"))) {
    // The page never loads these two, and the Artifact service reserves names that start with "_".
    if (/\/_(build|ssg)Manifest\.js$/.test(file.replaceAll("\\", "/"))) { rmSync(file); continue; }
    if (!/\.(js|css)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    let next = relativizeAssets(text);
    if (/\/static\/chunks\/index-[^/]*\.js$/.test(file.replaceAll("\\", "/"))) {
      next = patchPreloadHelper(next);
      patched += 1;
    }
    if (next !== text) writeFileSync(file, next);
  }
  if (patched !== 1) throw new Error(`Expected one index chunk, found ${patched}.`);

  const html = ensureTitle(relativizeAssets(raw));
  if (html.replaceAll("__next", "").includes("_next/")) throw new Error("Page still points at _next/.");
  writeFileSync(join(out, "app-win.html"), withDesktopShim(html, "win32"));
  writeFileSync(join(out, "app-mac.html"), withDesktopShim(html, "darwin"));

  const version = readFileSync(join(here, "VERSION"), "utf8").trim();
  writeFileSync(join(out, "index.html"), renderWrapper(readFileSync(join(here, "wrapper.html"), "utf8"), version));
  cpSync(join(here, "seed.js"), join(out, "seed.js"));
  cpSync(join(here, "samples"), join(out, "samples"), { recursive: true });
  cpSync(join(repo, "docs/samples/clipbox-test-snippets.csv"), join(out, "samples/4-full-test-sheet.csv"));

  const source = readFileSync(join(repo, "app/image-store.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  writeFileSync(join(out, "image-store.js"), compiled.outputText);

  const files = walk(out)
    .map((p) => relative(out, p).replaceAll("\\", "/"))
    .filter((p) => p !== "index.html" && p !== "files.json")
    .sort();
  for (const p of files) {
    if (p.split("/").slice(0, -1).some((part) => part.startsWith("_"))) throw new Error(`Published folder starts with "_": ${p}`);
  }
  writeFileSync(join(out, "files.json"), JSON.stringify(files, null, 2) + "\n");
  console.log("version", version);
  console.log(files.join("\n"));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
