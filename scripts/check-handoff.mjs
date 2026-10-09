// CI guard: a pull request that changes the app must leave a handoff note, so the next developer or agent can
// pick up where this one stopped. A note is a NEW file docs/log/YYYY-MM-DD-slug.md (one file per PR, so parallel
// PRs never edit the same lines). Updating docs/HANDOFF.md still counts, for PRs opened before this rule.
// It also warns when a PR edits the preview version files, which only the preview publisher may touch.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const LOG_ENTRY = /^docs\/log\/\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.md$/;
const PREVIEW_OWNED = ["tools/preview/VERSION", "tools/preview/changelog.json"];

/** @param {{ file: string, status: string }[]} changes name-status entries of the PR */
export function checkHandoff(changes) {
  const files = changes.map((change) => change.file);
  const touchesApp = files.some((file) => /^(app|desktop)\//.test(file) || file === "package.json");
  const addedLog = changes.some((change) => change.status === "A" && LOG_ENTRY.test(change.file));
  const updatedHandoff = files.includes("docs/HANDOFF.md");
  const previewFiles = files.filter((file) => PREVIEW_OWNED.includes(file));
  return {
    ok: !touchesApp || addedLog || updatedHandoff,
    touchesApp,
    addedLog,
    previewFiles,
  };
}

function main() {
  const base = process.env.BASE_REF || "origin/main";
  const changes = execFileSync("git", ["diff", "--name-status", `${base}...HEAD`], { encoding: "utf8" })
    .split("\n").map((line) => line.trim()).filter(Boolean)
    .map((line) => { const [status, ...rest] = line.split(/\s+/); return { status: status[0], file: rest[rest.length - 1] }; });
  const result = checkHandoff(changes);
  if (result.previewFiles.length) {
    console.log(`::warning::${result.previewFiles.join(", ")} belong to the preview publisher (see AGENTS.md, "Parallel PRs"). Feature PRs must not edit them.`);
  }
  if (!result.ok) {
    console.error("This PR changes app/, desktop/ or package.json but adds no handoff note.");
    console.error("Add a new file docs/log/YYYY-MM-DD-short-name.md (see docs/log/README.md).");
    process.exit(1);
  }
  console.log(result.touchesApp ? "Handoff note found." : "No app changes; handoff check skipped.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
