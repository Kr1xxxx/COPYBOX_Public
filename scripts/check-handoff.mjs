// CI guard: a pull request that changes the app must leave a handoff note, so the next developer or agent can
// pick up where this one stopped. A note is a NEW file docs/log/YYYY-MM-DD-slug.md (one file per PR, so parallel
// PRs never edit the same lines). Updating docs/HANDOFF.md still counts, for PRs opened before this rule.
// A note must say what changed (an empty file does not count). The preview version files belong to the preview
// publisher: any other PR that edits them fails, and the publisher's PRs carry the label `preview-publisher`.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const LOG_ENTRY = /^docs\/log\/\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.md$/;
const PREVIEW_OWNED = ["tools/preview/VERSION", "tools/preview/changelog.json"];

const NOTE_SAYS_WHAT = /^- What changed: \S.{9,}/m;

/**
 * @param {{ file: string, status: string }[]} changes name-status entries of the PR
 * @param {{ readFile?: (file: string) => string, labels?: string[] }} context
 */
export function checkHandoff(changes, { readFile = () => "", labels = [] } = {}) {
  const files = changes.map((change) => change.file);
  const touchesApp = files.some((file) => /^(app|desktop)\//.test(file) || file === "package.json");
  const addedLog = changes.some((change) => change.status === "A" && LOG_ENTRY.test(change.file) && NOTE_SAYS_WHAT.test(readFile(change.file)));
  const updatedHandoff = files.includes("docs/HANDOFF.md");
  const previewFiles = files.filter((file) => PREVIEW_OWNED.includes(file));
  const previewAllowed = labels.includes("preview-publisher");
  return {
    ok: (!touchesApp || addedLog || updatedHandoff) && (previewFiles.length === 0 || previewAllowed),
    handoffOk: !touchesApp || addedLog || updatedHandoff,
    touchesApp,
    addedLog,
    previewFiles,
    previewAllowed,
  };
}

function main() {
  const base = process.env.BASE_REF || "origin/main";
  const changes = execFileSync("git", ["diff", "--name-status", `${base}...HEAD`], { encoding: "utf8" })
    .split("\n").map((line) => line.trim()).filter(Boolean)
    .map((line) => { const [status, ...rest] = line.split(/\s+/); return { status: status[0], file: rest[rest.length - 1] }; });
  const readFile = (file) => execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8" });
  const labels = JSON.parse(process.env.LABELS || "[]");
  const result = checkHandoff(changes, { readFile, labels });
  if (result.previewFiles.length && !result.previewAllowed) {
    console.error(`${result.previewFiles.join(", ")} belong to the preview publisher (AGENTS.md, "Parallel PRs").`);
    console.error("Take them out of this PR; the 【話術】 thread bumps the version and writes the changelog.");
  }
  if (!result.handoffOk) {
    console.error("This PR changes app/, desktop/ or package.json but has no usable handoff note.");
    console.error("Add a new file docs/log/YYYY-MM-DD-short-name.md with a '- What changed: ...' line (see docs/log/README.md).");
  }
  if (!result.ok) process.exit(1);
  console.log(result.touchesApp ? "Handoff note found." : "No app changes; handoff check skipped.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
