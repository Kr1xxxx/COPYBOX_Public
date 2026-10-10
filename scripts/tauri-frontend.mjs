// Builds the page the Tauri shell loads: dist-tauri/index.html plus _next/. Needs "npm run build" first.
// The app has one page and no server calls, so the server-rendered page is saved once and served as a file.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(repo, "dist-tauri");

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
  const child = spawn(process.execPath, [join(repo, "node_modules/vinext/dist/cli.js"), "start"], {
    cwd: repo,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
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

if (!existsSync(join(repo, "dist/client/_next"))) {
  console.error('Run "npm run build" first.');
  process.exit(1);
}
const html = await fetchServerHtml();
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(repo, "dist/client/_next"), join(out, "_next"), { recursive: true });
writeFileSync(join(out, "index.html"), html.includes("<title>") ? html : html.replace("<head>", "<head><title>Clipbox</title>"));
console.log("wrote dist-tauri/");
