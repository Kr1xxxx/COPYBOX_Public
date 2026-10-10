// Looks up the newest published version. It only tells the user; it never downloads or installs anything.
const CHECK_TIMEOUT_MS = 10_000;

function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value || "").trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

// 1 when a is newer, -1 when older, 0 when equal; null when either is not a version.
function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i += 1) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}

function isSafeDownloadUrl(value) {
  try { return new URL(String(value)).protocol === "https:"; } catch { return false; }
}

function cleanNotes(notes) {
  const lines = Array.isArray(notes) ? notes : String(notes || "").split("\n");
  return lines.map((line) => String(line).trim()).filter(Boolean).slice(0, 5).map((line) => line.slice(0, 80));
}

function createUpdateChecker({ url, currentVersion, fetchImpl = fetch }) {
  let downloadUrl = "";

  async function check() {
    if (!url) return { status: "disabled" };
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS), cache: "no-store" });
      if (!response.ok) return { status: "error" };
      const manifest = await response.json();
      const order = compareVersions(manifest?.version, currentVersion);
      if (order === null) return { status: "error" };
      if (order <= 0) return { status: "current" };
      if (!isSafeDownloadUrl(manifest.url)) return { status: "error" };
      downloadUrl = manifest.url;
      return { status: "available", version: String(manifest.version).replace(/^v/, ""), notes: cleanNotes(manifest.notes) };
    } catch {
      return { status: "error" };
    }
  }

  return { check, getDownloadUrl: () => downloadUrl };
}

module.exports = { compareVersions, createUpdateChecker, isSafeDownloadUrl };
