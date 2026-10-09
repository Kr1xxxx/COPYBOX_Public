// Decides whether a pull request may merge on its own ("small") or must wait for the owner ("big").
// Policy: docs/DECISIONS.md D-011. CI calls this; the pure `classify` function is unit-tested.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const APP_LINE_LIMIT = 350;

// Files that change how the product or the process works — always the owner's call.
const OWNER_PATHS = [
  /^desktop\//, /^package(-lock)?\.json$/, /^\.github\//, /^scripts\//,
  /^AGENTS\.md$/, /^CLAUDE\.md$/, /^CONTRIBUTING\.md$/, /^docs\/DECISIONS\.md$/,
  /^eslint\.config\./, /^playwright\.config\./, /^vite\.config\./, /^next\.config\./, /^tsconfig.*\.json$/,
];

// Data storage and encryption: a mistake here can lock users out of their data.
const STORAGE_WORDS = /localStorage|sessionStorage|indexedDB|encryptVault|decryptVault|crypto\.subtle|PBKDF2|AES-GCM|STORAGE_KEY|DEVICE_KEY|clipbox\.vault|safeStorage/;

// A storage line that was only moved (removed in one place, added unchanged elsewhere, any indentation) is not a
// storage change. Cancel removed against added lines one-for-one by trimmed text; whatever is left over counts.
function leftoverStorageLines(changedLines) {
  const balance = new Map();
  for (const line of changedLines) {
    const text = line.slice(1).trim();
    if (STORAGE_WORDS.test(text)) balance.set(text, (balance.get(text) || 0) + (line[0] === "+" ? 1 : -1));
  }
  return [...balance].filter(([, count]) => count !== 0);
}

/**
 * @param {{ files: { path: string, added: number, deleted: number, status: string }[],
 *           appDiff: string, labels: string[] }} change
 */
export function classify({ files, appDiff, labels }) {
  const reasons = [];
  if (labels.includes("major")) reasons.push("labelled major (new feature, removed feature or layout change)");
  for (const file of files) {
    if (OWNER_PATHS.some((pattern) => pattern.test(file.path))) reasons.push(`changes ${file.path}`);
    if (file.status === "D" && /^(app|tests)\//.test(file.path)) reasons.push(`deletes ${file.path}`);
  }
  const changedLines = appDiff.split("\n").filter((line) => /^[+-](?![+-])/.test(line));
  if (leftoverStorageLines(changedLines).length) reasons.push("touches data storage or encryption");
  const appLines = files.filter((file) => file.path.startsWith("app/")).reduce((sum, file) => sum + file.added + file.deleted, 0);
  if (appLines > APP_LINE_LIMIT) reasons.push(`${appLines} lines of app code changed (limit ${APP_LINE_LIMIT})`);
  const testFiles = files.filter((file) => file.path.startsWith("tests/"));
  const testNet = testFiles.reduce((sum, file) => sum + file.added - file.deleted, 0);
  if (testNet < -10) reasons.push(`removes ${-testNet} more test lines than it adds`);
  return { size: reasons.length ? "big" : "small", reasons: [...new Set(reasons)] };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function collect(base) {
  const statuses = new Map(git(["diff", "--name-status", `${base}...HEAD`]).split("\n").filter(Boolean).map((line) => {
    const [status, ...paths] = line.split("\t");
    return [paths.at(-1), status[0]];
  }));
  const files = git(["diff", "--numstat", `${base}...HEAD`]).split("\n").filter(Boolean).map((line) => {
    const [added, deleted, ...rest] = line.split("\t");
    const path = rest.join("\t").replace(/^.*\{.* => (.*)\}(.*)$/, (_, to, tail) => to + tail).replace(/^.* => /, "");
    return { path, added: Number(added) || 0, deleted: Number(deleted) || 0, status: statuses.get(path) || "M" };
  });
  return { files, appDiff: git(["diff", "--unified=0", `${base}...HEAD`, "--", "app"]) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const labels = JSON.parse(process.env.LABELS || "[]");
  const result = classify({ ...collect(process.env.BASE_REF || "origin/main"), labels });
  console.log(`size: ${result.size}`);
  for (const reason of result.reasons) console.log(`- ${reason}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `size=${result.size}\n`);
}
