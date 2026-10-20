// Owner page of copyboxx.com at /admin (D-065): who registered, when they last signed in and synced, how many
// computers are signed in, whether the email is activated (D-086) and how big their cloud copy is. It never decrypts
// or shows anyone's content; its only writing button makes activation codes (D-086), shown once, stored as SHA-256. Only the addresses in the Worker secret ADMIN_EMAILS (comma-separated) can sign in,
// with a 6-digit code sent to that address (same Resend path as the app). Other addresses get the same "sent" answer
// and no mail. The admin session is an HttpOnly, SameSite=Strict cookie for 12 hours; its SHA-256 lives in D1
// admin_sessions. Without DB, RESEND_API_KEY or ADMIN_EMAILS every /admin/api/* answers 503.

import { allowRequest, codeHash, bytesToBase64Url, changes, emailDomain, json, normalizeEmail, randomActivationCode, randomCode, readJson, sameText, sendCodeMail, sha256Hex } from "./api.mjs";

const hour = 60 * 60 * 1000;
const codeLifetime = 10 * 60 * 1000;
const adminSessionLifetime = 12 * hour;
// Must match sessionLifetime in api.mjs: the app's sessions keep only their expiry, so sign-in time = expiry - 90 days.
const appSessionLifetime = 90 * 24 * hour;
const maxCodeAttempts = 5;
const cookieName = "__Host-cbx_admin";

const messages = {
  unavailable: "后台暂时不能用",
  bad_email: "邮箱格式不对",
  bad_code: "验证码不对或已过期，请重新获取",
  rate_limited: "请求太频繁，请一小时后再试",
  mail_failed: "验证码没发出去，请稍后再试",
  unauthorized: "请重新登录",
  forbidden: "不允许这个请求",
  bad_request: "请求格式不对",
  not_found: "找不到这个页面",
  method_not_allowed: "不支持这个操作",
};

function fail(status, code, headers = {}) {
  return json({ error: code, message: messages[code] }, status, headers);
}

export function isAdminPath(pathname) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

// The allowed admin addresses from the ADMIN_EMAILS secret, normalized; empty when unset.
export function adminEmails(env) {
  return String(env?.ADMIN_EMAILS ?? "")
    .split(/[,\s]+/)
    .map(normalizeEmail)
    .filter(Boolean);
}

function pageHeaders(type) {
  return {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    "Content-Security-Policy":
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  };
}

function readCookie(request, name) {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

function sessionCookie(token, maxAgeSeconds) {
  return `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

// The admin email of a valid session cookie whose address is still in ADMIN_EMAILS, or null.
async function adminSession(request, env, now) {
  const token = readCookie(request, cookieName);
  if (!token || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT email, expires_at FROM admin_sessions WHERE token_hash = ?").bind(tokenHash).first();
  if (!row) return null;
  if (row.expires_at <= now || !adminEmails(env).includes(row.email)) {
    await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  return { email: row.email, tokenHash };
}

async function requestCode(request, env, now) {
  const db = env.DB;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!(await allowRequest(db, `admin-ip:${ip}`, 10, now))) return fail(429, "rate_limited");
  const parsed = await readJson(request, 4096);
  const email = normalizeEmail(parsed.body?.email);
  if (!email) return fail(400, "bad_email");
  // An address that is not an admin gets the same answer, so the page never tells which address is the owner's.
  if (!adminEmails(env).includes(email)) return json({ ok: true });
  if (!(await allowRequest(db, `admin-email:${email}`, 5, now))) return fail(429, "rate_limited");
  const key = `admin:${email}`;
  const code = randomCode();
  await db
    .prepare("INSERT OR REPLACE INTO login_codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)")
    .bind(key, await codeHash(key, code), now + codeLifetime)
    .run();
  if (!(await sendCodeMail(env, email, code))) {
    await db.prepare("DELETE FROM login_codes WHERE email = ?").bind(key).run();
    return fail(502, "mail_failed");
  }
  return json({ ok: true });
}

async function verifyCode(request, env, now) {
  const db = env.DB;
  const parsed = await readJson(request, 4096);
  const email = normalizeEmail(parsed.body?.email);
  const code = typeof parsed.body?.code === "string" ? parsed.body.code.trim() : "";
  const wrong = () => fail(401, "bad_code");
  if (!email || !/^\d{6}$/.test(code) || !adminEmails(env).includes(email)) return wrong();
  const key = `admin:${email}`;
  const row = await db.prepare("SELECT code_hash, expires_at, attempts FROM login_codes WHERE email = ?").bind(key).first();
  if (!row) return wrong();
  if (row.expires_at <= now || row.attempts >= maxCodeAttempts) {
    await db.prepare("DELETE FROM login_codes WHERE email = ?").bind(key).run();
    return wrong();
  }
  if (!sameText(await codeHash(key, code), row.code_hash)) {
    if (row.attempts + 1 >= maxCodeAttempts) await db.prepare("DELETE FROM login_codes WHERE email = ?").bind(key).run();
    else await db.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?").bind(key).run();
    return wrong();
  }
  const removed = await db.prepare("DELETE FROM login_codes WHERE email = ? AND code_hash = ?").bind(key, row.code_hash).run();
  if (changes(removed) !== 1) return wrong();
  await db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(now).run();
  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  await db
    .prepare("INSERT INTO admin_sessions (token_hash, email, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256Hex(token), email, now + adminSessionLifetime)
    .run();
  return json({ ok: true, email }, 200, { "Set-Cookie": sessionCookie(token, adminSessionLifetime / 1000) });
}

// Company domains bound to a library (KV domains/<domain>): an email there is activated without a code (D-086).
async function boundDomains(env) {
  try {
    const { keys } = await env.FILES.list({ prefix: "domains/" });
    return new Set(keys.map((key) => key.name.slice("domains/".length)));
  } catch {
    return new Set();
  }
}

async function listUsers(env, session, now) {
  const domains = env.FILES ? await boundDomains(env) : new Set();
  const { results } = await env.DB.prepare(
    `SELECT u.email, u.created_at, u.last_sync_at,
       (SELECT max(s.expires_at) FROM sessions s WHERE s.user_id = u.id) AS last_expiry,
       (SELECT count(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS devices,
       (SELECT group_concat(coalesce(s.device, '未命名'), '、') FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS device_names,
       m.version, m.updated_at,
       (SELECT count(*) FROM activation_codes a WHERE a.email = u.email) AS codes,
       (SELECT length(b.data) FROM vault_blobs b WHERE b.key = 'vaults/' || u.id || '.json') AS size
     FROM users u LEFT JOIN vault_meta m ON m.user_id = u.id
     ORDER BY u.created_at DESC LIMIT 2000`,
  )
    .bind(now, now)
    .all();
  const users = results.map((row) => ({
    email: row.email,
    createdAt: row.created_at ?? null,
    lastSignInAt: row.last_expiry ? row.last_expiry - appSessionLifetime : null,
    lastSyncAt: row.last_sync_at ?? null,
    devices: row.devices ?? 0,
    deviceNames: row.device_names ? String(row.device_names).split("、") : [],
    activated: row.codes > 0 ? "code" : domains.has(emailDomain(row.email)) ? "domain" : null,
    version: row.version ?? 0,
    vaultUpdatedAt: row.updated_at ?? null,
    vaultBytes: row.size ?? null,
  }));
  return json({ admin: session.email, now, users });
}

// POST /admin/api/codes {count}: makes 1–50 activation codes (D-086) and answers them in plain text, this once;
// only their SHA-256 and first four characters are kept. GET lists every code: hint, made, redeemed by, when.
async function makeCodes(request, env, now) {
  const parsed = await readJson(request, 4096);
  const count = Number.isInteger(parsed.body?.count) ? parsed.body.count : 1;
  if (count < 1 || count > 50) return fail(400, "bad_request");
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    const code = randomActivationCode();
    await env.DB.prepare("INSERT INTO activation_codes (code_hash, hint, created_at) VALUES (?, ?, ?)")
      .bind(await sha256Hex(code.replaceAll("-", "")), code.slice(0, 4), now)
      .run();
    codes.push(code);
  }
  return json({ codes });
}

async function listCodes(env) {
  const { results } = await env.DB.prepare("SELECT hint, created_at, email, used_at FROM activation_codes ORDER BY created_at DESC LIMIT 2000").all();
  return json({ codes: results.map((row) => ({ hint: row.hint, createdAt: row.created_at, email: row.email ?? null, usedAt: row.used_at ?? null })) });
}

async function logout(env, session) {
  await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(session.tokenHash).run();
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}

const routes = {
  "/admin/api/code": { POST: "code" },
  "/admin/api/verify": { POST: "verify" },
  "/admin/api/users": { GET: "users" },
  "/admin/api/codes": { GET: "codes", POST: "makeCodes" },
  "/admin/api/logout": { POST: "logout" },
};

// Answers every request under /admin. `now` is for tests.
export async function handleAdmin(request, env, now = Date.now()) {
  const url = new URL(request.url);
  const read = request.method === "GET" || request.method === "HEAD";
  if (url.pathname === "/admin") return new Response(null, { status: 308, headers: { Location: "/admin/", "Cache-Control": "no-cache" } });
  if (url.pathname === "/admin/" && read) return new Response(request.method === "HEAD" ? null : adminPage(), { headers: pageHeaders("text/html; charset=utf-8") });
  if (url.pathname === "/admin/admin.js" && read) return new Response(request.method === "HEAD" ? null : adminScript(), { headers: pageHeaders("text/javascript; charset=utf-8") });
  if (url.pathname === "/admin/admin.css" && read) return new Response(request.method === "HEAD" ? null : adminStyle(), { headers: pageHeaders("text/css; charset=utf-8") });
  const known = Object.hasOwn(routes, url.pathname) ? routes[url.pathname] : null;
  if (!known) return fail(404, "not_found");
  const action = Object.hasOwn(known, request.method) ? known[request.method] : null;
  if (!action) return fail(405, "method_not_allowed", { Allow: Object.keys(known).join(", ") });
  // Only this page may call these: a request from another site is refused even before the SameSite cookie rule.
  const origin = request.headers.get("Origin");
  if ((origin && origin !== url.origin) || request.headers.get("Sec-Fetch-Site") === "cross-site") return fail(403, "forbidden");
  if (request.method === "POST" && !(request.headers.get("Content-Type") ?? "").startsWith("application/json")) return fail(400, "bad_request");
  if (!env?.DB || !env.RESEND_API_KEY || adminEmails(env).length === 0) return fail(503, "unavailable");
  if (action === "code") return requestCode(request, env, now);
  if (action === "verify") return verifyCode(request, env, now);
  const session = await adminSession(request, env, now);
  if (!session) return fail(401, "unauthorized");
  if (action === "users") return listUsers(env, session, now);
  if (action === "codes") return listCodes(env);
  if (action === "makeCodes") return makeCodes(request, env, now);
  return logout(env, session);
}

// ---- the page (no build step: plain HTML, CSS and JS served from here) ----

function adminPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Copyboxx 后台</title>
<link rel="stylesheet" href="/admin/admin.css">
<script src="/admin/admin.js" defer></script>
</head>
<body>
<main>
  <section id="login" class="card" hidden>
    <h1>Copyboxx 后台</h1>
    <label>邮箱<input id="email" type="email" autocomplete="email"></label>
    <button id="send" type="button">获取验证码</button>
    <label id="code-row" hidden>验证码<input id="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label>
    <button id="verify" type="button" hidden>登录</button>
    <p id="login-note" class="note"></p>
  </section>
  <section id="panel" hidden>
    <header>
      <h1>用户</h1>
      <span id="count" class="muted"></span>
      <span class="spacer"></span>
      <input id="filter" type="search" placeholder="搜索邮箱">
      <button id="refresh" type="button">刷新</button>
      <button id="logout" type="button" class="quiet">退出</button>
    </header>
    <div class="table-wrap">
      <table>
        <thead><tr><th>邮箱</th><th>注册时间</th><th>最后登录</th><th>最后同步</th><th>已登录电脑</th><th>激活</th><th>云端数据</th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
    <p id="panel-note" class="note"></p>
    <header class="codes-head">
      <h1>激活码</h1>
      <span id="codes-count" class="muted"></span>
      <span class="spacer"></span>
      <label class="inline">数量<input id="code-count" type="number" min="1" max="50" value="1"></label>
      <button id="make-codes" type="button">生成激活码</button>
    </header>
    <pre id="new-codes" class="new-codes" hidden></pre>
    <div class="table-wrap">
      <table>
        <thead><tr><th>激活码</th><th>生成时间</th><th>使用邮箱</th><th>使用时间</th></tr></thead>
        <tbody id="code-rows"></tbody>
      </table>
    </div>
    <p class="note">非公司邮箱登录后要输入激活码才能用；公司域名的邮箱不用。激活码只在生成时显示一次，请马上复制。</p>
  </section>
</main>
</body>
</html>
`;
}

function adminStyle() {
  return `:root { color-scheme: light dark; --bg: #f6f6f4; --card: #fff; --text: #1d1d1f; --muted: #6e6e73; --line: #e3e3e0; --accent: #2f6fde; }
@media (prefers-color-scheme: dark) { :root { --bg: #161617; --card: #1f1f21; --text: #f2f2f2; --muted: #9a9aa0; --line: #333336; --accent: #6b9cff; } }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
h1 { font-size: 20px; margin: 0; }
.card { max-width: 360px; margin: 10vh auto 0; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 24px; display: grid; gap: 12px; }
label { display: grid; gap: 4px; color: var(--muted); }
input { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
button { font: inherit; border: 0; border-radius: 8px; padding: 8px 14px; background: var(--accent); color: #fff; cursor: pointer; }
button.quiet { background: transparent; color: var(--muted); border: 1px solid var(--line); }
button:disabled { opacity: .5; cursor: default; }
.note { color: var(--muted); min-height: 1.5em; margin: 0; }
header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.spacer { flex: 1; }
.muted { color: var(--muted); }
.table-wrap { overflow-x: auto; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
table { border-collapse: collapse; width: 100%; min-width: 760px; }
th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { color: var(--muted); font-weight: 500; }
tr:last-child td { border-bottom: 0; }
td.devices { white-space: normal; }
.codes-head { margin-top: 32px; }
label.inline { display: flex; align-items: center; gap: 6px; }
label.inline input { width: 64px; }
.new-codes { margin: 0 0 12px; padding: 12px 14px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; font-size: 16px; letter-spacing: 1px; user-select: all; }
`;
}

function adminScript() {
  return `"use strict";
const $ = (id) => document.getElementById(id);
let users = [];

async function call(method, path, body) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

function time(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function size(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function render() {
  const query = $("filter").value.trim().toLowerCase();
  const shown = users.filter((user) => user.email.includes(query));
  const online = users.reduce((sum, user) => sum + user.devices, 0);
  $("count").textContent = "注册 " + users.length + " 人 · 登录中 " + online + " 台" + (query ? "，显示 " + shown.length + " 人" : "");
  const rows = $("rows");
  rows.replaceChildren();
  for (const user of shown) {
    const tr = document.createElement("tr");
    tr.append(
      cell(user.email),
      cell(time(user.createdAt)),
      cell(user.lastSignInAt ? time(user.lastSignInAt) : "还没登录过"),
      cell(time(user.lastSyncAt)),
      cell(user.devices ? user.devices + " 台（" + user.deviceNames.join("、") + "）" : "0", "devices"),
      cell(user.activated === "domain" ? "公司邮箱" : user.activated === "code" ? "已激活" : "未激活"),
      cell(size(user.vaultBytes)),
    );
    rows.append(tr);
  }
  $("panel-note").textContent = shown.length ? "时间按北京时间显示。员工的话术和账号内容是加密的，这里看不到。" : "还没有用户";
}

function renderCodes(codes) {
  const used = codes.filter((code) => code.email).length;
  $("codes-count").textContent = "共 " + codes.length + " 个，已使用 " + used + " 个";
  const rows = $("code-rows");
  rows.replaceChildren();
  for (const code of codes) {
    const tr = document.createElement("tr");
    tr.append(cell(code.hint + "-····-····-····"), cell(time(code.createdAt)), cell(code.email || "未使用"), cell(time(code.usedAt)));
    rows.append(tr);
  }
}

async function load() {
  const { status, data } = await call("GET", "/admin/api/users");
  if (status === 401) return showLogin();
  if (status !== 200) {
    $("panel-note").textContent = data.message || "读取失败，请刷新";
    return;
  }
  users = data.users;
  $("login").hidden = true;
  $("panel").hidden = false;
  render();
  const codes = await call("GET", "/admin/api/codes");
  if (codes.status === 200) renderCodes(codes.data.codes);
}

$("make-codes").addEventListener("click", async () => {
  $("make-codes").disabled = true;
  const { status, data } = await call("POST", "/admin/api/codes", { count: Number($("code-count").value) || 1 });
  $("make-codes").disabled = false;
  if (status !== 200) return void ($("panel-note").textContent = data.message || "生成失败");
  $("new-codes").textContent = data.codes.join("\n");
  $("new-codes").hidden = false;
  const codes = await call("GET", "/admin/api/codes");
  if (codes.status === 200) renderCodes(codes.data.codes);
});

function showLogin(note) {
  $("panel").hidden = true;
  $("login").hidden = false;
  $("login-note").textContent = note || "";
}

$("send").addEventListener("click", async () => {
  $("send").disabled = true;
  const { status, data } = await call("POST", "/admin/api/code", { email: $("email").value });
  $("send").disabled = false;
  if (status !== 200) return void ($("login-note").textContent = data.message || "发送失败");
  $("code-row").hidden = false;
  $("verify").hidden = false;
  $("send").textContent = "重新获取";
  $("login-note").textContent = "如果这个邮箱可以登录后台，验证码已经发过去了。";
  $("code").focus();
});

$("verify").addEventListener("click", async () => {
  $("verify").disabled = true;
  const { status, data } = await call("POST", "/admin/api/verify", { email: $("email").value, code: $("code").value });
  $("verify").disabled = false;
  if (status !== 200) return void ($("login-note").textContent = data.message || "登录失败");
  $("code").value = "";
  load();
});

$("refresh").addEventListener("click", load);
$("filter").addEventListener("input", render);
$("logout").addEventListener("click", async () => {
  await call("POST", "/admin/api/logout");
  users = [];
  showLogin("已退出");
});

load();
`;
}
