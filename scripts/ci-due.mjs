// Owner 2026-10-20: CI on main runs once every 5 preview versions (2.40, 2.45, …), not on every push; a run
// started by hand always goes ahead. The pure `isDue` function is unit-tested.
// shortcut: two merges landing together can jump past a multiple of 5 (2.39 → 2.41); start that round by hand.
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function isDue(version, event) {
  return event !== "push" || Math.round(Number(version) * 100) % 5 === 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const version = readFileSync("tools/preview/VERSION", "utf8").trim();
  const due = isDue(version, process.env.EVENT);
  console.log(`version ${version}: ${due ? "run the checks" : "skip until the next multiple of 5"}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${due}\n`);
}
