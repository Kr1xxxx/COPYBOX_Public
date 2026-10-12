// Windows smoke test (run by .github/workflows/windows-smoke.yml on a GitHub Windows runner, or by hand on Windows).
// Installs the NSIS installer, starts the real app, drives its page through the WebView2 debugging port with
// Playwright, and checks: install, launch, import (made-up data), copy to the real clipboard, restart keeps the
// data, and a hard kill keeps the data. By default only shell-level checks run (install, window, restart after a kill, uninstall entry); the page steps need SMOKE_UI=1. Results, screenshots and logs go to SMOKE_OUT.
//
//   node tests/windows-smoke/smoke.mjs <path to Setup.exe>
import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CSV = path.join(here, "smoke-snippets.csv");
const OUT = path.resolve(process.env.SMOKE_OUT || "smoke-out");
const PORT = 9222;
const EXPECT_ROWS = 3;
const FIRST_TEXT = "Smoke test one: hello from the made-up sample data.";
const installer = process.argv[2];
// SMOKE_UI=1 also drives the page; it needs a build with the test-hooks feature (see docs/log note). Default: shell-level checks only.
const UI = process.env.SMOKE_UI === "1";

fs.mkdirSync(OUT, { recursive: true });
const results = [];
const log = (line) => { console.log(line); fs.appendFileSync(path.join(OUT, "smoke.log"), `${new Date().toISOString()} ${line}\n`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function step(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || "", ms: Date.now() - started });
    log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
    return true;
  } catch (error) {
    results.push({ name, ok: false, detail: String(error && error.message || error), ms: Date.now() - started });
    log(`FAIL ${name} — ${error && error.stack || error}`);
    return false;
  }
}

function powershell(command) {
  const run = spawnSync("powershell", ["-NoProfile", "-Sta", "-Command", `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${command}`], { encoding: "utf8" });
  return { out: (run.stdout || "").trim(), err: (run.stderr || "").trim(), code: run.status };
}

function desktopShot(name) {
  const file = path.join(OUT, `${name}.png`).replace(/\\/g, "/");
  powershell(`Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $bmp.Save('${file}')`);
}

const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
let exe = "";
let child = null;
let browser = null;

function findInstalledExe() {
  const roots = [path.join(localAppData, "Clipbox"), path.join(localAppData, "Programs", "Clipbox"), path.join(process.env.ProgramFiles || "C:\\Program Files", "Clipbox")];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const found = fs.readdirSync(root).filter((name) => name.toLowerCase().endsWith(".exe") && !/^unins|^uninstall/i.test(name));
    if (found.length) return path.join(root, found[0]);
  }
  return "";
}

function launch(tag) {
  const outFile = fs.openSync(path.join(OUT, `app-${tag}.log`), "a");
  const env = { ...process.env };
  if (UI) env.CLIPBOX_TEST_DEBUG_PORT = String(PORT);
  child = spawn(exe, [], {
    env,
    stdio: ["ignore", outFile, outFile],
    windowsHide: false,
  });
  child.on("exit", (code) => log(`app process (${tag}) exited with ${code}`));
}

async function connect(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
        const context = browser.contexts()[0];
        for (let i = 0; i < 60; i += 1) {
          const page = context.pages().find((candidate) => !candidate.url().startsWith("devtools:"));
          if (page) { await page.waitForSelector(".app-shell", { timeout: 30000 }); return page; }
          await sleep(500);
        }
        throw new Error("no page appeared in the app window");
      }
    } catch (error) { lastError = String(error && error.message || error); }
    await sleep(1000);
  }
  diagnose();
  throw new Error(`the app page never answered on port ${PORT}: ${lastError}`);
}

// Printed into the job log when the page cannot be reached, so the cause is visible without opening the artifact.
function diagnose() {
  const lines = [
    `app process alive: ${child ? child.exitCode === null : "not started"}`,
    powershell("Get-Process | Where-Object { $_.ProcessName -match 'clipbox|msedgewebview2' } | Select-Object ProcessName,Id,MainWindowTitle | Format-Table -AutoSize | Out-String -Width 200").out,
    powershell("Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | Select-Object -First 2 -ExpandProperty CommandLine | Out-String -Width 4000").out,
    powershell("netstat -ano | Select-String 'LISTENING' | Select-String '9222|127.0.0.1' | Out-String -Width 200").out,
    powershell("Get-ChildItem \"$env:LOCALAPPDATA\\com.clipbox.tauri\" -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 30 -ExpandProperty FullName | Out-String -Width 300").out,
  ];
  for (const line of lines) log(`DIAG ${line}`);
  desktopShot("diag-desktop");
}

async function stopApp() {
  try { await browser?.close(); } catch { /* the app may already be gone */ }
  browser = null;
  spawnSync("taskkill", ["/F", "/T", "/IM", path.basename(exe)], { encoding: "utf8" });
  await sleep(2000);
}

function dataDirListing() {
  const dir = path.join(localAppData, "com.clipbox.tauri");
  const lines = [];
  const walk = (current, depth) => {
    if (depth > 4 || !fs.existsSync(current)) return;
    for (const name of fs.readdirSync(current)) {
      const full = path.join(current, name);
      const stat = fs.statSync(full);
      lines.push(`${path.relative(dir, full)}\t${stat.isDirectory() ? "dir" : stat.size}`);
      if (stat.isDirectory()) walk(full, depth + 1);
    }
  };
  walk(dir, 0);
  fs.writeFileSync(path.join(OUT, "data-dir.txt"), lines.join("\n"));
  return lines.length;
}

async function rowCount(page) { return page.locator(".native-row").count(); }

async function waitForWindow(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const out = powershell("(Get-Process clipbox -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle } | Select-Object -First 1 -ExpandProperty MainWindowTitle)").out;
    if (out) return out;
    if (child && child.exitCode !== null) throw new Error(`the app exited early with ${child.exitCode}`);
    await sleep(1000);
  }
  diagnose();
  throw new Error("no app window appeared");
}

async function finish() {
  const files = dataDirListing();
  const uninstall = powershell("Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' | ForEach-Object { Get-ItemProperty $_.PSPath } | Where-Object { $_.DisplayName -like '*Clipbox*' } | Select-Object DisplayName,DisplayVersion | Out-String");
  fs.writeFileSync(path.join(OUT, "uninstall-entry.txt"), uninstall.out);
  await step("uninstall entry exists", async () => {
    if (!/Clipbox/.test(uninstall.out)) throw new Error("no Clipbox entry in the installed-programs list");
    return `${files} files in the data folder; ${uninstall.out.replace(/\s+/g, " ")}`;
  });
}

async function main() {
  if (!installer || !fs.existsSync(installer)) throw new Error(`installer not found: ${installer}`);
  let page;

  await step("install silently", async () => {
    const run = spawnSync(installer, ["/S"], { encoding: "utf8", timeout: 180000 });
    if (run.status !== 0) throw new Error(`installer exited with ${run.status}`);
    for (let i = 0; i < 30 && !findInstalledExe(); i += 1) await sleep(1000);
    exe = findInstalledExe();
    if (!exe) throw new Error("no program was installed in the usual folders");
    return exe;
  });
  if (!exe) return;


  await step("the app starts and its window appears", async () => {
    launch("first");
    const title = await waitForWindow(90000);
    desktopShot("01-first-start-desktop");
    return `window title "${title}"`;
  });

  await step("the app wrote its data folder", async () => {
    await sleep(4000);
    const files = dataDirListing();
    if (!files) throw new Error("no data folder was created");
    return `${files} entries in the data folder`;
  });

  await step("a hard kill, then starting again, shows the window again", async () => {
    await stopApp();
    const before = dataDirListing();
    launch("after-kill");
    const title = await waitForWindow(90000);
    desktopShot("02-after-kill-desktop");
    const after = dataDirListing();
    if (after < before) throw new Error(`the data folder shrank from ${before} to ${after} entries`);
    return `window "${title}"; data folder ${before} -> ${after} entries`;
  });
  if (!UI) { await finish(); return; }
  await stopApp();

  await step("starts and shows the main page", async () => {
    launch("first");
    page = await connect();
    await page.screenshot({ path: path.join(OUT, "01-first-start.png") });
    desktopShot("01-first-start-desktop");
    return await page.title();
  });
  if (!page) return;

  await step("imports the made-up snippet sheet", async () => {
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 20000 }),
      page.getByRole("button", { name: /导入话术表格/ }).first().click(),
    ]);
    await chooser.setFiles(CSV);
    await page.locator("[role=dialog]").getByRole("button", { name: /导入 \d+ 条/ }).click();
    await page.waitForSelector(".native-row", { timeout: 20000 });
    await sleep(2500);
    const count = await rowCount(page);
    await page.screenshot({ path: path.join(OUT, "02-imported.png") });
    if (count !== EXPECT_ROWS) throw new Error(`expected ${EXPECT_ROWS} snippets, found ${count}`);
    return `${count} snippets`;
  });

  await step("copy puts the text on the real Windows clipboard", async () => {
    powershell("Set-Clipboard -Value 'cleared-before-copy'");
    await page.locator(".native-row", { hasText: "测试｜第一条" }).locator(".row-main").click();
    const row = page.locator(".native-row.selected");
    await row.getByRole("button", { name: "复制", exact: true }).click();
    let clip = "";
    for (let i = 0; i < 20; i += 1) {
      clip = powershell("Get-Clipboard -Raw").out;
      if (clip === FIRST_TEXT) break;
      await sleep(500);
    }
    await page.screenshot({ path: path.join(OUT, "03-copied.png") });
    if (clip !== FIRST_TEXT) throw new Error(`clipboard held "${clip}"`);
    return clip;
  });

  await step("restart from inside the app keeps the data", async () => {
    await sleep(2500);
    const before = dataDirListing();
    await page.evaluate(() => window.clipboxDesktop.relaunch());
    await sleep(3000);
    try { await browser.close(); } catch { /* connection drops with the old window */ }
    browser = null;
    page = await connect(120000);
    await sleep(2000);
    const count = await rowCount(page);
    await page.screenshot({ path: path.join(OUT, "04-after-restart.png") });
    if (count !== EXPECT_ROWS) throw new Error(`after the restart there were ${count} snippets (data files before: ${before})`);
    return `${count} snippets still there`;
  });

  await step("a hard kill keeps the data that was already saved", async () => {
    await sleep(2500);
    await stopApp();
    launch("after-kill");
    page = await connect(120000);
    await sleep(2000);
    const count = await rowCount(page);
    await page.screenshot({ path: path.join(OUT, "05-after-kill.png") });
    if (count !== EXPECT_ROWS) throw new Error(`after the kill there were ${count} snippets`);
    return `${count} snippets still there`;
  });

  await finish();
}

try {
  await main();
} catch (error) {
  results.push({ name: "setup", ok: false, detail: String(error && error.message || error), ms: 0 });
  log(`FAIL setup — ${error && error.stack || error}`);
} finally {
  try { desktopShot("99-end-desktop"); } catch { /* best effort */ }
  try { await stopApp(); } catch { /* best effort */ }
  const failed = results.filter((entry) => !entry.ok);
  const table = results.map((entry) => `| ${entry.ok ? "通过" : "**失败**"} | ${entry.name} | ${entry.detail.replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 200)} |`).join("\n");
  const summary = `### Windows 冒烟测试\n\n| 结果 | 步骤 | 说明 |\n| --- | --- | --- |\n${table}\n\n${failed.length ? `${failed.length} 项失败` : "全部通过"}\n`;
  fs.writeFileSync(path.join(OUT, "results.md"), summary);
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  process.exitCode = failed.length ? 1 : 0;
}
