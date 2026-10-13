// Deploys copyboxx.com (see README.md): node tools/website/deploy.mjs [--dry-run]
// 1. uploads dist-website/kv-bulk.json to the KV namespace bound as FILES, 2. deletes keys that are no longer in
// dist-website/manifest.json, 3. deploys the Worker (worker.mjs). Run `npm run website:build` first.
// wrangler reads CLOUDFLARE_API_TOKEN (and, in the Claude cloud session, NODE_EXTRA_CA_CERTS) from the environment.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const out = join(repo, "dist-website");
const config = relative(repo, join(here, "wrangler.jsonc")).replaceAll("\\", "/");
const wrangler = ["--yes", "wrangler@4.150.0"];
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

// Keys in the namespace that the current build no longer has.
export function staleKeys(existingKeys, manifestKeys) {
  const keep = new Set(manifestKeys);
  return [...new Set(existingKeys)].filter((key) => !keep.has(key)).sort();
}

// `wrangler kv key list` prints a JSON array of { name, … }; anything before it (warnings) is skipped.
export function parseKeyList(stdout) {
  const start = stdout.indexOf("[");
  if (start < 0) throw new Error("wrangler kv key list did not print a key list.");
  return JSON.parse(stdout.slice(start)).map((entry) => entry.name);
}

function show(args) {
  return ["npx", ...args].map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(" ");
}

function run(args, { capture = false } = {}) {
  console.log(`> ${show(args)}`);
  const result = spawnSync(npx, args, {
    cwd: repo,
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    console.error(`Failed: ${show(args)}`);
    process.exit(result.status || 1);
  }
  return result.stdout ?? "";
}

export function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes("--dry-run");
  const bulk = join(out, "kv-bulk.json");
  const manifestFile = join(out, "manifest.json");
  if (!existsSync(bulk) || !existsSync(manifestFile)) {
    console.error('Run "npm run website:build" first.');
    process.exit(1);
  }
  const kv = ["--binding", "FILES", "--remote", "--config", config];
  const put = [...wrangler, "kv", "bulk", "put", "dist-website/kv-bulk.json", ...kv];
  const list = [...wrangler, "kv", "key", "list", ...kv];
  const deleteArgs = (file) => [...wrangler, "kv", "bulk", "delete", file, ...kv, "--force"];
  const deploy = [...wrangler, "deploy", "--config", config];

  if (dryRun) {
    for (const args of [put, list, deleteArgs("<stale keys file>"), deploy]) console.log(show(args));
    return;
  }

  run(put);
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8")).keys;
  const stale = staleKeys(parseKeyList(run(list, { capture: true })), manifest);
  if (stale.length) {
    const dir = mkdtempSync(join(tmpdir(), "clipbox-website-"));
    try {
      const file = join(dir, "stale-keys.json");
      writeFileSync(file, JSON.stringify(stale));
      console.log(`Removing ${stale.length} old file(s): ${stale.join(", ")}`);
      run(deleteArgs(file));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } else {
    console.log("No old files to remove.");
  }
  run(deploy);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
