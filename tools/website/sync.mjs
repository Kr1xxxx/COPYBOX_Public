// Publishes company 话术 libraries for the app's 同步码 sync (see README.md "话术同步"). Each code has one library
// at the KV key sync/<CODE>/snippets.json, served by worker.mjs at https://copyboxx.com/sync/<CODE>/snippets.json.
//
//   node tools/website/sync.mjs --new-code XS [--dry-run]                       new code with an empty library
//   node tools/website/sync.mjs --code XS-7KQ2M9AB --snippets file.json [--notice notice.txt] [--dry-run]   validate, diff, upload
//   node tools/website/sync.mjs --code XS-7KQ2M9AB --rollback [--dry-run]       restore the newest history copy
//   node tools/website/sync.mjs --list-codes                                     codes in KV (agents only)
//   node tools/website/sync.mjs --link-domain company.com --code XS-7KQ2M9AB [--dry-run]   bind an email domain to a code
//   node tools/website/sync.mjs --unlink-domain company.com [--dry-run]          remove a domain's binding
//   node tools/website/sync.mjs --list-domains                                   bound domains and their codes
//
// A bound domain (KV key domains/<domain>, value the code) gives everyone who signs in with an address there the
// code's library through GET /api/library (api.mjs). Bind only after the owner says 发布; free-mail domains are refused.
//
// Before an upload the version online is copied to sync/<CODE>/history/snippets-<UTC ISO>.json. A rollback puts the
// newest history copy back, keeps the replaced version as history/replaced-<UTC ISO>.json and removes the copy it
// restored, so a second rollback goes one step further back. --notice adds the 更新通知 the owner approved (D-071,
// docs/whats-new.md): a text file with one line per item, or JSON {"title"?, "items": [...]}; a library without
// --notice goes up with no notice, so an old one is never shown again. Codes are not secret but must not be guessable: never
// commit a real code. Talks to the Cloudflare API directly (in the Claude cloud session the proxy adds the token;
// elsewhere set CLOUDFLARE_API_TOKEN). Node's fetch needs NODE_USE_ENV_PROXY=1 behind the proxy.
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { contentHash, parseSharedLibrary, SHARED_FORMAT } from "../../app/shared-library.ts";
import { parseContentNotice } from "../../app/whats-new.ts";
import { isFreeMailDomain, normalizeDomain } from "./free-mail.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const api = "https://api.cloudflare.com/client/v4";

// Crockford base32: no I, L, O or U, so a code read aloud or typed by hand is not misread.
const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function emptyLibrary() {
  return `${JSON.stringify({ format: SHARED_FORMAT, version: 1, items: [] }, null, 2)}\n`;
}

// "XS" → "XS-7KQ2M9AB": the two-letter group hint, a dash, eight characters from the crypto RNG.
export function newCode(prefix, random = randomInt) {
  const hint = String(prefix ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(hint)) throw new Error("--new-code needs two letters, for example --new-code XS");
  let tail = "";
  for (let index = 0; index < 8; index += 1) tail += crockford[random(crockford.length)];
  return `${hint}-${tail}`;
}

// Codes are stored upper case; worker.mjs upper-cases what the app sends, so a code typed in lower case still works.
export function normalizeCode(code) {
  const value = String(code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,40}$/.test(value)) throw new Error(`Not a valid code: ${code}`);
  return value;
}

export const libraryKey = (code) => `sync/${code}/snippets.json`;
export const domainPrefix = "domains/";
export const domainKey = (domain) => `${domainPrefix}${domain}`;
export const historyPrefix =(code) => `sync/${code}/history/`;
const stamp = (now) => new Date(now).toISOString();
export const historyKey = (code, now) => `${historyPrefix(code)}snippets-${stamp(now)}.json`;
export const replacedKey = (code, now) => `${historyPrefix(code)}replaced-${stamp(now)}.json`;

// The newest snippets-*.json among the history keys (ISO stamps sort as text), or null.
export function newestHistoryKey(keys, code) {
  const prefix = `${historyPrefix(code)}snippets-`;
  return keys.filter((key) => key.startsWith(prefix)).sort().at(-1) ?? null;
}

// sync/<CODE>/snippets.json keys → codes.
export function codesFromKeys(keys) {
  return keys.map((key) => /^sync\/([^/]+)\/snippets\.json$/.exec(key)?.[1]).filter(Boolean).sort();
}

// Checks a library file with the app's own rules. Refuses entries the app would skip (missing id, label or text,
// a repeated id), so nobody publishes a file that silently loses 话术.
export function validateLibrary(source) {
  const { items, skipped } = parseSharedLibrary(source);
  if (skipped) throw new Error(`${skipped} entr${skipped === 1 ? "y is" : "ies are"} missing id, label or secret, or repeat an id; fix the file first.`);
  return items;
}

// What changes for employees: ids added, changed (text or folder) and removed, each sorted.
export function diffLibraries(beforeItems, afterItems) {
  const fingerprint = (item) => `${item.folder}\n${contentHash(item)}`;
  const before = new Map(beforeItems.map((item) => [item.id, fingerprint(item)]));
  const after = new Map(afterItems.map((item) => [item.id, fingerprint(item)]));
  const added = [...after.keys()].filter((id) => !before.has(id)).sort();
  const removed = [...before.keys()].filter((id) => !after.has(id)).sort();
  const changed = [...after.keys()].filter((id) => before.has(id) && before.get(id) !== after.get(id)).sort();
  return { added, changed, removed };
}

// Puts the approved 更新通知 into the library text. The id is new for every push (code + UTC minute), so devices show it once.
export function withNotice(source, noticeText, code, now) {
  const trimmed = noticeText.trim();
  let raw;
  if (trimmed.startsWith("{")) {
    try { raw = JSON.parse(trimmed); } catch { throw new Error("--notice JSON is not valid."); }
  } else {
    raw = { items: trimmed.split(/\r?\n/).map((line) => line.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean) };
  }
  const stamp = new Date(now).toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const notice = parseContentNotice({ ...raw, id: `${code}-${stamp}` });
  if (!notice) throw new Error("--notice needs at least one line of text.");
  const library = JSON.parse(source);
  if (Array.isArray(library)) throw new Error("--notice needs a library file with \"items\", not a bare list.");
  library.notice = { id: notice.id, title: notice.title, items: notice.items };
  return { text: `${JSON.stringify(library, null, 2)}\n`, notice };
}

// A domain that may be bound: plausible (normalizeDomain) and not free mail, lower case.
export function bindableDomain(value) {
  const domain = normalizeDomain(value);
  if (!domain) throw new Error(`Not a valid domain: ${value}`);
  if (isFreeMailDomain(domain)) throw new Error(`${domain} is a free-mail domain; anyone can get an address there, so it cannot be bound.`);
  return domain;
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function namespaceId(configText) {
  const config = JSON.parse(configText.replace(/^\s*\/\/.*$/gm, ""));
  const id = config.kv_namespaces?.find((entry) => entry.binding === "FILES")?.id;
  if (!id) throw new Error("No FILES namespace in wrangler.jsonc.");
  return id;
}

function cloudflare() {
  const headers = { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN || "placeholder"}` };
  const namespace = namespaceId(readFileSync(join(here, "wrangler.jsonc"), "utf8"));
  let account = process.env.CLOUDFLARE_ACCOUNT_ID || "";
  async function call(path, init = {}) {
    const response = await fetch(`${api}${path}`, { ...init, headers: { ...headers, ...init.headers } });
    return response;
  }
  async function base() {
    if (!account) {
      const response = await call("/accounts");
      const body = await response.json();
      if (!response.ok || !body.result?.length) throw new Error(`Cannot read the Cloudflare account (${response.status}).`);
      account = body.result[0].id;
    }
    return `/accounts/${account}/storage/kv/namespaces/${namespace}`;
  }
  return {
    async get(key) {
      const response = await call(`${await base()}/values/${encodeURIComponent(key)}`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Reading ${key} failed (${response.status}).`);
      return response.text();
    },
    async put(key, text) {
      const form = new FormData();
      form.set("value", new Blob([text], { type: "application/json" }));
      form.set("metadata", JSON.stringify({ type: "application/json; charset=utf-8", size: Buffer.byteLength(text) }));
      const response = await call(`${await base()}/values/${encodeURIComponent(key)}`, { method: "PUT", body: form });
      if (!response.ok) throw new Error(`Writing ${key} failed (${response.status}): ${await response.text()}`);
    },
    async remove(key) {
      const response = await call(`${await base()}/values/${encodeURIComponent(key)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`Deleting ${key} failed (${response.status}).`);
    },
    async list(prefix) {
      const keys = [];
      let cursor = "";
      do {
        const query = new URLSearchParams({ prefix, limit: "1000", ...(cursor ? { cursor } : {}) });
        const response = await call(`${await base()}/keys?${query}`);
        const body = await response.json();
        if (!response.ok) throw new Error(`Listing ${prefix} failed (${response.status}).`);
        keys.push(...body.result.map((entry) => entry.name));
        cursor = body.result_info?.cursor || "";
      } while (cursor);
      return keys;
    },
  };
}

function printDiff({ added, changed, removed }) {
  console.log(`added   ${added.length}${added.length ? `: ${added.join(", ")}` : ""}`);
  console.log(`changed ${changed.length}${changed.length ? `: ${changed.join(", ")}` : ""}`);
  console.log(`removed ${removed.length}${removed.length ? `: ${removed.join(", ")}` : ""}`);
}

export async function main(argv = process.argv.slice(2), kv = cloudflare(), now = Date.now()) {
  const dryRun = argv.includes("--dry-run");
  const note = dryRun ? " (dry run, nothing uploaded)" : "";

  if (argv.includes("--list-codes")) {
    for (const code of codesFromKeys(await kv.list("sync/"))) console.log(code);
    return;
  }

  if (argv.includes("--list-domains")) {
    for (const key of (await kv.list(domainPrefix)).sort()) {
      const bound = await kv.get(key);
      console.log(`${key.slice(domainPrefix.length)} → ${bound === null ? "(gone)" : bound.trim()}`);
    }
    return;
  }

  if (argv.includes("--link-domain")) {
    const domain = bindableDomain(option(argv, "--link-domain"));
    const code = normalizeCode(option(argv, "--code"));
    if ((await kv.get(libraryKey(code))) === null) throw new Error(`${code} has no library; create codes with --new-code.`);
    const before = await kv.get(domainKey(domain));
    console.log(`before  ${domain} → ${before === null ? "(not bound)" : before.trim()}`);
    console.log(`after   ${domain} → ${code}${note}`);
    if (!dryRun) await kv.put(domainKey(domain), code);
    return;
  }

  if (argv.includes("--unlink-domain")) {
    const value = option(argv, "--unlink-domain");
    const domain = normalizeDomain(value);
    if (!domain) throw new Error(`Not a valid domain: ${value}`);
    const before = await kv.get(domainKey(domain));
    if (before === null) throw new Error(`${domain} is not bound.`);
    console.log(`unlink  ${domain} → ${before.trim()}${note}`);
    if (!dryRun) await kv.remove(domainKey(domain));
    return;
  }

  if (argv.includes("--new-code")) {
    const code = newCode(option(argv, "--new-code"));
    if ((await kv.get(libraryKey(code))) !== null) throw new Error(`${code} already exists; run again for another code.`);
    if (!dryRun) await kv.put(libraryKey(code), emptyLibrary());
    console.log(`code ${code}${note}`);
    console.log(`url  https://copyboxx.com/sync/${code}/snippets.json`);
    return;
  }

  const code = normalizeCode(option(argv, "--code"));
  const current = await kv.get(libraryKey(code));

  if (argv.includes("--rollback")) {
    const previous = newestHistoryKey(await kv.list(historyPrefix(code)), code);
    if (!previous) throw new Error(`${code} has no history to roll back to.`);
    const restored = await kv.get(previous);
    if (restored === null) throw new Error(`${previous} disappeared; try again.`);
    printDiff(diffLibraries(current === null ? [] : validateLibrary(current), validateLibrary(restored)));
    console.log(`restore ${previous}${note}`);
    if (dryRun) return;
    if (current !== null) await kv.put(replacedKey(code, now), current);
    await kv.put(libraryKey(code), restored);
    await kv.remove(previous);
    return;
  }

  const file = option(argv, "--snippets");
  if (!file) {
    throw new Error(
      "Give --snippets <file.json>, --rollback, --new-code <XX>, --list-codes, --link-domain <domain> --code <CODE>, --unlink-domain <domain> or --list-domains.",
    );
  }
  if (current === null) throw new Error(`${code} does not exist; create codes with --new-code.`);
  let source = readFileSync(resolve(file), "utf8");
  const noticeFile = option(argv, "--notice");
  if (noticeFile) {
    const added = withNotice(source, readFileSync(resolve(noticeFile), "utf8"), code, now);
    source = added.text;
    console.log(`notice  ${added.notice.title}: ${added.notice.items.join(" / ")}`);
  }
  const items = validateLibrary(source);
  const diff = diffLibraries(validateLibrary(current), items);
  printDiff(diff);
  console.log(`${items.length} 话术 for ${code}${note}`);
  if (dryRun) return;
  if (!diff.added.length && !diff.changed.length && !diff.removed.length && current === source) {
    console.log("Nothing changed; not uploaded.");
    return;
  }
  await kv.put(historyKey(code, now), current);
  await kv.put(libraryKey(code), source);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
