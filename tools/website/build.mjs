// Builds the public website for copyboxx.com (see README.md):
//   node tools/website/build.mjs [--installer <file>] [--preview <dir>] [--out <dir>]
// Defaults: --preview dist-preview, --out dist-website (relative to the repo root). Without --installer the newest
// tauri-test-N Windows installer is downloaded from GitHub Releases (GITHUB_TOKEN or GH_TOKEN is sent when set; the
// repo is private). In the Claude cloud environment Node's fetch only goes through the proxy with NODE_USE_ENV_PROXY=1.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { previewBuildInfo } from "../preview/build.mjs";
import { appVersionFrom } from "../../scripts/sync-version.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const previewDir = join(repo, "tools/preview");

export const siteUrl = "https://copyboxx.com";
export const installerPath = "download/Clipboxx-Setup.exe";
const releasesApi = "https://api.github.com/repos/Kr1xxxx/Clipbox/releases?per_page=20";

// Fills __VERSION__, __UPDATED__ and __SIZE__; a placeholder left over means the template and this build disagree.
export function renderPage(template, info) {
  const html = template
    .replaceAll("__VERSION__", String(info.version).trim())
    .replaceAll("__UPDATED__", String(info.updated))
    .replaceAll("__SIZE__", String(info.size));
  const left = html.match(/__[A-Z]+__/);
  if (left) throw new Error(`Placeholder ${left[0]} was not filled.`);
  return html;
}

// The newest (by published_at) tauri-test-N release that carries a Windows setup asset; returns { release, asset }.
export function pickInstaller(releases) {
  const candidates = (Array.isArray(releases) ? releases : [])
    .filter((release) => String(release?.tag_name ?? "").startsWith("tauri-test-"))
    .map((release) => ({ release, asset: (release.assets ?? []).find((a) => String(a?.name ?? "").endsWith("-Windows-setup.exe")) }))
    .filter((entry) => entry.asset)
    .sort((a, b) => Date.parse(b.release.published_at ?? 0) - Date.parse(a.release.published_at ?? 0));
  if (!candidates.length) throw new Error("No tauri-test release with a Windows installer was found on GitHub.");
  return candidates[0];
}

// 2414270 → "2.3 MB" (one decimal, always MB).
export function formatSize(bytes) {
  return `${(Number(bytes) / (1024 * 1024)).toFixed(1)} MB`;
}

// download/latest.json: the { version, notes, url } shape of the desktop update check (D-023), plus size and checksum.
// info.version is the preview version ("1.65"); the file carries the app version ("1.65.0").
export function latestJson(info) {
  return {
    version: appVersionFrom(info.version),
    notes: [...(info.notes ?? [])],
    url: `${siteUrl}/${installerPath}`,
    size: info.size,
    sha256: info.sha256,
    updatedAt: info.updatedAt,
  };
}

function option(argv, name, fallback) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value.`);
  return value;
}

async function downloadInstaller() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "clipbox-website-build" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const list = await fetch(releasesApi, { headers });
  if (!list.ok) throw new Error(`GitHub releases could not be listed (HTTP ${list.status}). Set GITHUB_TOKEN or pass --installer.`);
  const { release, asset } = pickInstaller(await list.json());
  console.log(`installer ${release.tag_name} ${asset.name}`);
  const file = await fetch(asset.url, { headers: { ...headers, Accept: "application/octet-stream" } });
  if (!file.ok) throw new Error(`Installer download failed (HTTP ${file.status}).`);
  return Buffer.from(await file.arrayBuffer());
}

export async function main(argv = process.argv.slice(2)) {
  const preview = resolve(repo, option(argv, "--preview", "dist-preview"));
  const out = resolve(repo, option(argv, "--out", "dist-website"));
  const installerArg = option(argv, "--installer", "");
  if (!existsSync(join(preview, "index.html"))) {
    console.error('Run "npm run preview:build" first.');
    process.exit(1);
  }

  const installer = installerArg ? readFileSync(resolve(repo, installerArg)) : await downloadInstaller();
  if (installer.length < 2 || installer[0] !== 0x4d || installer[1] !== 0x5a) throw new Error("The installer is not a Windows program (it does not start with MZ).");

  const version = readFileSync(join(previewDir, "VERSION"), "utf8").trim();
  const changelog = JSON.parse(readFileSync(join(previewDir, "changelog.json"), "utf8"));
  const info = previewBuildInfo(changelog, version);
  const updated = new Date(info.updatedAt).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const size = installer.length;
  const sha256 = createHash("sha256").update(installer).digest("hex");

  const page = renderPage(readFileSync(join(here, "index.html"), "utf8"), { version, updated, size: formatSize(size) });
  const latest = latestJson({ version, notes: changelog?.[0]?.items ?? [], size, sha256, updatedAt: info.updatedAt });

  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, "download"), { recursive: true });
  writeFileSync(join(out, "index.html"), page);
  cpSync(join(here, "404.html"), join(out, "404.html"));
  cpSync(preview, join(out, "preview"), { recursive: true });
  writeFileSync(join(out, installerPath), installer);
  writeFileSync(join(out, "download/latest.json"), JSON.stringify(latest, null, 2) + "\n");

  console.log("out", out);
  console.log("version", latest.version);
  console.log("size", `${size} bytes (${formatSize(size)})`);
  console.log("sha256", sha256);
  return { out, latest };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
