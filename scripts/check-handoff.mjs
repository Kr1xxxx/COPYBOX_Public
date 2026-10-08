// CI guard: a pull request that changes the app must also update docs/HANDOFF.md,
// so the next developer or agent can pick up where this one stopped.
import { execFileSync } from "node:child_process";

const base = process.env.BASE_REF || "origin/main";
const changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" })
  .split("\n").map((line) => line.trim()).filter(Boolean);

const touchesApp = changed.some((file) => /^(app|desktop)\//.test(file) || file === "package.json");
const updatedHandoff = changed.includes("docs/HANDOFF.md");

if (touchesApp && !updatedHandoff) {
  console.error("This PR changes app/, desktop/ or package.json but not docs/HANDOFF.md.");
  console.error("Update the status, task board and log in docs/HANDOFF.md before merging.");
  process.exit(1);
}
console.log(touchesApp ? "docs/HANDOFF.md updated." : "No app changes; handoff check skipped.");
