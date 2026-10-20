// Owner 2026-10-20: CI on main runs once every 5 preview versions (2.40, 2.45, …), not on every push; a run
// started by hand always goes ahead. D-090: a push is due when VERSION crossed a 0.05 step since the previous main
// (2.39 → 2.41 counts), so two merges landing together no longer skip a round. The pure `isDue` is unit-tested.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const FILE = "tools/preview/VERSION";
const step = (version) => Math.floor(Math.round(Number(version) * 100) / 5);

export function isDue(version, event, previous) {
  if (event !== "push") return true;
  // Previous main unknown (first push, force-push): fall back to "exactly a multiple of 0.05".
  if (!previous) return Math.round(Number(version) * 100) % 5 === 0;
  return step(version) > step(previous);
}

function previousVersion(sha) {
  if (!sha || /^0+$/.test(sha)) return "";
  try {
    execFileSync("git", ["fetch", "--quiet", "--depth=1", "origin", sha], { stdio: "ignore" });
    return execFileSync("git", ["show", `FETCH_HEAD:${FILE}`], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const version = readFileSync(FILE, "utf8").trim();
  const previous = process.env.EVENT === "push" ? previousVersion(process.env.BEFORE) : "";
  const due = isDue(version, process.env.EVENT, previous);
  console.log(`version ${previous || "?"} → ${version}: ${due ? "run the checks" : "skip until the next 0.05 step"}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${due}\n`);
}
