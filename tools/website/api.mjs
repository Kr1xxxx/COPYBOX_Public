// Account and sync API of copyboxx.com (D-063, README.md「账号与同步接口」), imported by worker.mjs for /api/*.
// Login is only a 6-digit code sent to the email (no password). Each user has one blob, stored in R2 (binding VAULTS) or, without it, in D1,
// encrypted with a key derived from the Worker secret VAULT_KEY and the user id; D1 (binding DB, schema.sql) keeps
// users, code and session hashes, rate limits and the blob's version. Codes and session tokens are never stored,
// only their SHA-256. Without DB every /api/* answers 503, so the site can be deployed before they exist.
// The app calls from Rust, not from a browser page, so /api sends no CORS headers: browsers cannot read its answers.
// Errors are { error: <stable code for the app>, message: <plain Chinese> }.
// Only functions may be named exports of a Worker module (see worker.mjs), so constants stay private.
// GET /api/library gives a signed-in user the company 话术 library bound to their email domain (KV key domains/<domain>
// holds a 同步码, written by sync.mjs --link-domain); free-mail domains never get one.

import { isFreeMailDomain, normalizeDomain } from "./free-mail.mjs";

const hour = 60 * 60 * 1000;
const codeLifetime = 10 * 60 * 1000;
const sessionLifetime = 90 * 24 * hour;
const maxCodeAttempts = 5;
const codesPerEmailPerHour = 5;
const requestsPerIpPerHour = 20;
// Code requests per email or per IP an hour before 人机验证 is demanded (D-087): the 4th one needs a token.
const freeRequestsPerHour = 3;
const maxVaultBody = 5 * 1024 * 1024;
const maxSmallBody = 4 * 1024;
const maxDeviceName = 40;
// At most this many computers are signed in to one account; a new sign-in signs out the oldest (D-069).
const maxDevices = 3;

const messages = {
  unavailable: "同步服务暂时不能用，请稍后再试",
  mail_failed: "验证码没发出去，请稍后再试",
  bad_email: "邮箱格式不对",
  bad_code: "验证码不对或已过期，请重新获取",
  rate_limited: "请求太频繁，请一小时后再试",
  unauthorized: "请重新登录",
  device_limit: "这个账号在别的电脑上登录了，一个账号最多同时登录 3 台电脑，这台电脑已退出",
  bad_request: "请求格式不对",
  bad_data: "同步内容格式不对",
  too_large: "内容太大，无法同步",
  version_conflict: "云端有更新的内容，请先同步",
  not_found: "找不到这个接口",
  method_not_allowed: "不支持这个操作",
  storage_error: "云端数据读写失败，请稍后再试",
  captcha: "请先完成人机验证",
  bad_activation_code: "激活码不对或已经用过",
  not_activated: "这个邮箱还没激活",
};
const activationsPerIpPerHour = 10;

// ---- helpers ----

export function isApiPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

// Lower-cased, trimmed email, or null when it is not a plausible address.
export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 120) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra },
  });
}

function fail(status, code, extra = {}) {
  return json({ error: code, message: messages[code], ...extra.body }, status, extra.headers);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// The optional device name shown in a later session list: trimmed, at most 40 characters, null when empty.
export function deviceName(value) {
  if (typeof value !== "string") return null;
  const name = [...value.trim()].slice(0, maxDeviceName).join("");
  return name || null;
}

export function bytesToBase64Url(bytes) {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64ToBytes(text) {
  const raw = atob(text);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function sameText(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// A uniform 6-digit code from the crypto RNG (rejection sampling, so no digit is more likely).
export function randomCode() {
  const limit = Math.floor(0x100000000 / 1000000) * 1000000;
  const box = new Uint32Array(1);
  do crypto.getRandomValues(box);
  while (box[0] >= limit);
  return String(box[0] % 1000000).padStart(6, "0");
}

export function codeHash(email, code) {
  return sha256Hex(`${email}:${code}`);
}

// Reads the body as text, refusing more than `limit` bytes. Returns null when it is too large.
async function readText(request, limit) {
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

// { body } with the parsed JSON object, or { status } (413 too large, 400 not a JSON object).
export async function readJson(request, limit) {
  const text = await readText(request, limit);
  if (text === null) return { status: 413 };
  try {
    const body = JSON.parse(text);
    if (isPlainObject(body)) return { body };
  } catch {
    // falls through
  }
  return { status: 400 };
}

// ---- storage (D1) ----

export function changes(result) {
  return result?.meta?.changes ?? result?.changes ?? 0;
}

// How many requests `key` has made this hour (0 once the hour is over).
async function requestCount(db, key, now) {
  const row = await db.prepare("SELECT window_start, count FROM rate_limits WHERE key = ?").bind(key).first();
  return row && row.window_start > now - hour ? row.count : 0;
}

// Counts one request against `key`; answers the hour's count so far (truthy), or 0 when its limit is already reached.
export async function allowRequest(db, key, limit, now) {
  const count = await requestCount(db, key, now);
  if (count === 0) {
    await db.prepare("INSERT OR REPLACE INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)").bind(key, now).run();
    return 1;
  }
  if (count >= limit) return 0;
  await db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
  return count + 1;
}

async function sweep(db, now) {
  await db.prepare("DELETE FROM rate_limits WHERE window_start <= ?").bind(now - hour).run();
  await db.prepare("DELETE FROM login_codes WHERE expires_at <= ?").bind(now).run();
  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now).run();
  try {
    await db.prepare("DELETE FROM ended_sessions WHERE expires_at <= ?").bind(now).run();
  } catch {
    // Table not created yet (schema.sql not applied again); nothing to sweep.
  }
}

async function userByEmail(db, email) {
  return db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
}

async function ensureUser(db, email, now) {
  await db.prepare("INSERT OR IGNORE INTO users (id, email, created_at, last_sync_at) VALUES (?, ?, ?, NULL)").bind(crypto.randomUUID(), email, now).run();
  return userByEmail(db, email);
}

// True when this token was signed out because its account signed in on a 4th computer (until it would have expired).
async function endedByNewerDevice(db, tokenHash, now) {
  try {
    const row = await db.prepare("SELECT expires_at FROM ended_sessions WHERE token_hash = ?").bind(tokenHash).first();
    return Boolean(row && row.expires_at > now);
  } catch {
    return false;
  }
}

// Keeps the newest `maxDevices` live sessions of a user (`keep` is the one just made) and ends the rest; their tokens are
// remembered in ended_sessions so those computers can say why they were signed out. Returns the ended devices' names.
async function keepNewestSessions(db, userId, keep, now) {
  const { results = [] } = await db
    .prepare("SELECT token_hash, expires_at, device FROM sessions WHERE user_id = ? AND token_hash != ? AND expires_at > ? ORDER BY expires_at DESC")
    .bind(userId, keep, now)
    .all();
  const older = results.slice(maxDevices - 1);
  for (const session of older) {
    try {
      await db.prepare("INSERT OR REPLACE INTO ended_sessions (token_hash, expires_at) VALUES (?, ?)").bind(session.token_hash, session.expires_at).run();
    } catch {
      // Without the table that computer only hears 请重新登录; it is signed out all the same.
    }
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(session.token_hash).run();
  }
  return older.map((session) => session.device || "一台电脑");
}

// The user id of a valid `Authorization: Bearer <token>`, { ended: true } for a token signed out by a newer computer, or null.
async function authorizedUser(request, db, now) {
  const match = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(request.headers.get("Authorization") ?? "");
  if (!match) return null;
  const tokenHash = await sha256Hex(match[1]);
  const row = await db.prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?").bind(tokenHash).first();
  if (!row) return (await endedByNewerDevice(db, tokenHash, now)) ? { ended: true } : null;
  if (row.expires_at <= now) {
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  return { userId: row.user_id, tokenHash };
}

// ---- vault encryption (AES-GCM, key = HKDF(VAULT_KEY, user id)) ----

async function vaultKey(env, userId) {
  let secret;
  try {
    secret = base64ToBytes(String(env.VAULT_KEY ?? ""));
  } catch {
    return null;
  }
  if (secret.length !== 32) return null;
  const base = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("copyboxx-vault-v1"), info: new TextEncoder().encode(userId) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function vaultObjectKey(userId) {
  return `vaults/${userId}.json`;
}

// D1 keeps a row at most 2 MB, so a blob stored there (no R2 bucket bound) is capped a little below that.
const maxD1Blob = 1_900_000;

// Where the encrypted blobs live: the R2 bucket VAULTS when bound, otherwise the vault_blobs table in D1 (R2 needs to be
// switched on in the dashboard first; owner's account had it off on 2026-10-15). Both answer get / put / delete.
function vaultStore(env) {
  if (env.VAULTS) return { store: env.VAULTS, limit: Infinity };
  const db = env.DB;
  const store = {
    async get(key) {
      const row = await db.prepare("SELECT data FROM vault_blobs WHERE key = ?").bind(key).first();
      if (!row) return null;
      const bytes = new Uint8Array(row.data);
      return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    },
    async put(key, bytes) {
      await db.prepare("INSERT OR REPLACE INTO vault_blobs (key, data) VALUES (?, ?)").bind(key, bytes).run();
    },
    async delete(key) {
      await db.prepare("DELETE FROM vault_blobs WHERE key = ?").bind(key).run();
    },
  };
  return { store, limit: maxD1Blob };
}

// Stored bytes: 1 format byte (1), 12-byte IV, ciphertext. The user id is bound as additional data.
async function sealVault(key, userId, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = new TextEncoder().encode(`copyboxx-vault:${userId}`);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, key, new TextEncoder().encode(text)));
  const out = new Uint8Array(1 + iv.length + sealed.length);
  out[0] = 1;
  out.set(iv, 1);
  out.set(sealed, 1 + iv.length);
  return out;
}

async function unsealVault(key, userId, bytes) {
  if (bytes.length < 13 || bytes[0] !== 1) throw new Error("unknown vault format");
  const additionalData = new TextEncoder().encode(`copyboxx-vault:${userId}`);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(1, 13), additionalData }, key, bytes.slice(13));
  return new TextDecoder().decode(plain);
}

// ---- 人机验证 (Cloudflare Turnstile) and activation (D-086) ----

// True when Turnstile accepts the widget's response token. Only called while the secret TURNSTILE_SECRET is set.
export async function verifyTurnstile(env, token, ip) {
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    const result = await response.json();
    return result?.success === true;
  } catch {
    return false;
  }
}

// Activation codes look like 7KQ2-M9AB-X3TD-5RWP: 16 Crockford base32 characters (no I, L, O, U). Typed codes may
// come in lower case or without dashes; anything else is null.
const codeAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function randomActivationCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // 32 letters divide 256 evenly, so `& 31` is uniform.
  const text = [...bytes].map((byte) => codeAlphabet[byte & 31]).join("");
  return text.match(/.{4}/g).join("-");
}

export function normalizeActivationCode(value) {
  if (typeof value !== "string") return null;
  const text = value.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return text.length === 16 && [...text].every((char) => codeAlphabet.includes(char)) ? text : null;
}

// An email is activated when it redeemed a code, or when its domain is bound to a company library (KV domains/<domain>,
// sync.mjs --link-domain); free-mail domains are never bound.
export async function isActivated(env, email) {
  const row = await env.DB.prepare("SELECT 1 AS yes FROM activation_codes WHERE email = ? LIMIT 1").bind(email).first();
  if (row) return true;
  const domain = emailDomain(email);
  if (!domain || isFreeMailDomain(domain) || !env.FILES) return false;
  try {
    return typeof (await env.FILES.get(`domains/${domain}`)) === "string";
  } catch {
    return false;
  }
}

// POST /api/activate {code}: binds the code to the signed-in email. A code already bound to another email, an unknown
// code and a malformed one all answer the same 400. An email that is already activated gets 200 whatever it sends.
async function activate(request, env, auth, now) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!(await allowRequest(env.DB, `activate:${ip}`, activationsPerIpPerHour, now))) return fail(429, "rate_limited");
  const parsed = await readJson(request, maxSmallBody);
  if (parsed.status === 413) return fail(413, "too_large");
  const user = await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(auth.userId).first();
  if (!user) return fail(401, "unauthorized");
  if (await isActivated(env, user.email)) return json({ activated: true });
  const code = normalizeActivationCode(parsed.body?.code);
  if (!code) return fail(400, "bad_activation_code");
  const bound = await env.DB.prepare("UPDATE activation_codes SET email = ?, used_at = ? WHERE code_hash = ? AND email IS NULL")
    .bind(user.email, now, await sha256Hex(code))
    .run();
  if (changes(bound) !== 1) return fail(400, "bad_activation_code");
  return json({ activated: true });
}

// ---- endpoints ----

export async function sendCodeMail(env, email, code) {
  const text = `你的 Copyboxx 验证码是：${code}\n\n10 分钟内有效。如果不是你本人操作，请忽略这封邮件。`;
  const html = `<p>你的 Copyboxx 验证码是：</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p><p>10 分钟内有效。如果不是你本人操作，请忽略这封邮件。</p>`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Copyboxx <noreply@copyboxx.com>", to: [email], subject: `Copyboxx 验证码：${code}`, text, html }),
    });
    if (response.body) response.body.cancel().catch(() => {});
    return response.ok;
  } catch {
    return false;
  }
}

async function requestCode(request, env, now) {
  const db = env.DB;
  if (!env.RESEND_API_KEY) return fail(503, "unavailable");
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipRequests = await allowRequest(db, `ip:${ip}`, requestsPerIpPerHour, now);
  if (!ipRequests) return fail(429, "rate_limited");
  const parsed = await readJson(request, maxSmallBody);
  if (parsed.status === 413) return fail(413, "too_large");
  const email = normalizeEmail(parsed.body?.email);
  if (!email) return fail(400, "bad_email");
  // 人机验证 (D-086, D-087): only a frequent asker, the 4th request from one email or one IP within an hour, has to
  // pass it; a refused request does not use up the email's codes. Enforced once the secret is set, so apps without
  // the widget keep working until then.
  if (env.TURNSTILE_SECRET && (ipRequests > freeRequestsPerHour || (await requestCount(db, `email:${email}`, now)) >= freeRequestsPerHour)) {
    const token = parsed.body?.turnstile;
    if (typeof token !== "string" || !token || !(await verifyTurnstile(env, token, ip))) return fail(400, "captcha");
  }
  if (!(await allowRequest(db, `email:${email}`, codesPerEmailPerHour, now))) return fail(429, "rate_limited");
  await sweep(db, now);
  await ensureUser(db, email, now);
  const code = randomCode();
  await db
    .prepare("INSERT OR REPLACE INTO login_codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)")
    .bind(email, await codeHash(email, code), now + codeLifetime)
    .run();
  if (!(await sendCodeMail(env, email, code))) {
    await db.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();
    return fail(502, "mail_failed");
  }
  return json({ ok: true });
}

async function verifyCode(request, env, now) {
  const db = env.DB;
  const parsed = await readJson(request, maxSmallBody);
  if (parsed.status === 413) return fail(413, "too_large");
  const email = normalizeEmail(parsed.body?.email);
  const code = typeof parsed.body?.code === "string" ? parsed.body.code.trim() : "";
  const wrong = () => fail(401, "bad_code");
  if (!email || !/^\d{6}$/.test(code)) return wrong();
  const row = await db.prepare("SELECT code_hash, expires_at, attempts FROM login_codes WHERE email = ?").bind(email).first();
  if (!row) return wrong();
  if (row.expires_at <= now || row.attempts >= maxCodeAttempts) {
    await db.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();
    return wrong();
  }
  if (!sameText(await codeHash(email, code), row.code_hash)) {
    if (row.attempts + 1 >= maxCodeAttempts) await db.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();
    else await db.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?").bind(email).run();
    return wrong();
  }
  // Only the request that deletes the code gets a session, so one code never signs in twice.
  const removed = await db.prepare("DELETE FROM login_codes WHERE email = ? AND code_hash = ?").bind(email, row.code_hash).run();
  if (changes(removed) !== 1) return wrong();
  const user = await ensureUser(db, email, now);
  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(token);
  await db
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at, device) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, user.id, now + sessionLifetime, deviceName(parsed.body.device))
    .run();
  const signedOut = await keepNewestSessions(db, user.id, tokenHash, now);
  return json({ token, email, signedOut, activated: await isActivated(env, email) });
}

async function logout(env, auth) {
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(auth.tokenHash).run();
  return json({ ok: true });
}

async function getVault(env, auth) {
  const meta = await env.DB.prepare("SELECT version, updated_at FROM vault_meta WHERE user_id = ?").bind(auth.userId).first();
  if (!meta) return json({ version: 0, updatedAt: null, data: null });
  const key = await vaultKey(env, auth.userId);
  if (!key) return fail(503, "unavailable");
  const object = await vaultStore(env).store.get(vaultObjectKey(auth.userId));
  if (!object) return fail(500, "storage_error");
  try {
    const data = JSON.parse(await unsealVault(key, auth.userId, new Uint8Array(await object.arrayBuffer())));
    return json({ version: meta.version, updatedAt: meta.updated_at, data });
  } catch {
    return fail(500, "storage_error");
  }
}

async function putVault(request, env, auth, now) {
  const db = env.DB;
  const key = await vaultKey(env, auth.userId);
  if (!key) return fail(503, "unavailable");
  const parsed = await readJson(request, maxVaultBody);
  if (parsed.status === 413) return fail(413, "too_large");
  const { baseVersion, data } = parsed.body ?? {};
  if (!Number.isSafeInteger(baseVersion) || baseVersion < 0) return fail(400, "bad_request");
  if (!isPlainObject(data)) return fail(400, "bad_data");
  const { store, limit } = vaultStore(env);
  const text = JSON.stringify(data);
  if (new TextEncoder().encode(text).length > limit) return fail(413, "too_large");
  const current = async () => (await db.prepare("SELECT version FROM vault_meta WHERE user_id = ?").bind(auth.userId).first())?.version ?? 0;
  // Claim the next version in D1 first (atomic), so of two uploads from the same base only one goes ahead.
  const claim =
    baseVersion === 0
      ? db.prepare("INSERT OR IGNORE INTO vault_meta (user_id, version, updated_at) VALUES (?, 1, ?)").bind(auth.userId, now)
      : db.prepare("UPDATE vault_meta SET version = version + 1, updated_at = ? WHERE user_id = ? AND version = ?").bind(now, auth.userId, baseVersion);
  if (changes(await claim.run()) !== 1) return fail(409, "version_conflict", { body: { version: await current() } });
  const version = baseVersion + 1;
  try {
    await store.put(vaultObjectKey(auth.userId), await sealVault(key, auth.userId, text), { customMetadata: { version: String(version) } });
  } catch {
    // Give the version back so the app retries from the same base.
    if (baseVersion === 0) await db.prepare("DELETE FROM vault_meta WHERE user_id = ? AND version = 1").bind(auth.userId).run();
    else await db.prepare("UPDATE vault_meta SET version = ? WHERE user_id = ? AND version = ?").bind(baseVersion, auth.userId, version).run();
    return fail(500, "storage_error");
  }
  await db.prepare("UPDATE users SET last_sync_at = ? WHERE id = ?").bind(now, auth.userId).run();
  return json({ version });
}

async function deleteAccount(env, auth) {
  const db = env.DB;
  const user = await db.prepare("SELECT email FROM users WHERE id = ?").bind(auth.userId).first();
  await vaultStore(env).store.delete(vaultObjectKey(auth.userId));
  await db.prepare("DELETE FROM vault_meta WHERE user_id = ?").bind(auth.userId).run();
  await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(auth.userId).run();
  if (user) await db.prepare("DELETE FROM login_codes WHERE email = ?").bind(user.email).run();
  await db.prepare("DELETE FROM users WHERE id = ?").bind(auth.userId).run();
  return json({ ok: true });
}

// The text after the last "@" of an email, lower-cased and trimmed, or null when it is not a plausible domain.
export function emailDomain(email) {
  if (typeof email !== "string" || !email.includes("@")) return null;
  return normalizeDomain(email.slice(email.lastIndexOf("@") + 1));
}

// { domain, library } for the user's email domain, or both null: no FILES binding, no or free-mail domain, no binding,
// a bound code whose library is missing, or a library that is not valid JSON. Read on every request (no cache), so
// unbinding a domain takes effect on the next sync. A KV read that throws is a 500, so the app keeps what it has.
async function getLibrary(env, auth) {
  const none = () => json({ domain: null, library: null });
  if (!env.FILES) return none();
  const user = await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(auth.userId).first();
  const domain = emailDomain(user?.email);
  if (!domain || isFreeMailDomain(domain)) return none();
  let source;
  try {
    const bound = await env.FILES.get(`domains/${domain}`);
    const code = typeof bound === "string" ? bound.trim().toUpperCase() : "";
    if (!/^[A-Z0-9-]{6,40}$/.test(code)) return none();
    source = await env.FILES.get(`sync/${code}/snippets.json`);
  } catch {
    return fail(500, "storage_error");
  }
  if (typeof source !== "string") return none();
  let library;
  try {
    library = JSON.parse(source);
  } catch {
    return none();
  }
  if (library === null || typeof library !== "object") return none();
  return json({ domain, library });
}

const routes = {
  "/api/auth/code": { POST: "code" },
  "/api/auth/verify": { POST: "verify" },
  "/api/auth/logout": { POST: "logout" },
  "/api/vault": { GET: "getVault", PUT: "putVault" },
  "/api/account": { DELETE: "deleteAccount" },
  "/api/library": { GET: "getLibrary" },
  "/api/activate": { POST: "activate" },
};
const needsActivation = new Set(["getVault", "putVault", "getLibrary"]);

// Answers every request under /api/. `now` is for tests.
export async function handleApi(request, env, now = Date.now()) {
  const url = new URL(request.url);
  const known = Object.hasOwn(routes, url.pathname) ? routes[url.pathname] : null;
  if (!known) return fail(404, "not_found");
  const allow = `${Object.keys(known).join(", ")}, OPTIONS`;
  // No CORS: a preflight gets 204 without Access-Control headers, so a browser page still cannot call /api.
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow } });
  const action = Object.hasOwn(known, request.method) ? known[request.method] : null;
  if (!action) return fail(405, "method_not_allowed", { headers: { Allow: allow } });
  if (!env?.DB) return fail(503, "unavailable");
  if (action === "code") return requestCode(request, env, now);
  if (action === "verify") return verifyCode(request, env, now);
  const auth = await authorizedUser(request, env.DB, now);
  if (!auth) return fail(401, "unauthorized");
  if (auth.ended) return fail(401, "device_limit");
  if (action === "logout") return logout(env, auth);
  if (action === "activate") return activate(request, env, auth, now);
  if (needsActivation.has(action)) {
    const user = await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(auth.userId).first();
    if (!user || !(await isActivated(env, user.email))) return fail(403, "not_activated");
  }
  if (action === "getVault") return getVault(env, auth);
  if (action === "putVault") return putVault(request, env, auth, now);
  if (action === "getLibrary") return getLibrary(env, auth);
  return deleteAccount(env, auth);
}
