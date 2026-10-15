import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { adminEmails, handleAdmin } from "../tools/website/admin.mjs";
import { handleApi } from "../tools/website/api.mjs";
import worker from "../tools/website/worker.mjs";

// D1 stand-in on an in-memory SQLite database with the real schema.sql (same as website-api.test.mjs).
function fakeD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("tools/website/schema.sql", "utf8"));
  const statement = (sql, params = []) => ({
    bind: (...values) => statement(sql, values),
    async first() {
      return sqlite.prepare(sql).get(...params) ?? null;
    },
    async run() {
      const result = sqlite.prepare(sql).run(...params);
      return { success: true, meta: { changes: Number(result.changes) } };
    },
    async all() {
      return { success: true, results: sqlite.prepare(sql).all(...params) };
    },
  });
  return { sqlite, prepare: (sql) => statement(sql) };
}

function fakeEnv(extra = {}) {
  return {
    DB: fakeD1(),
    RESEND_API_KEY: "re_test_key",
    VAULT_KEY: Buffer.alloc(32, 7).toString("base64"),
    ADMIN_EMAILS: "Owner@Example.com, second@example.com",
    ...extra,
  };
}

function stubMail(t) {
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    sent.push(JSON.parse(init.body));
    return new Response("{}", { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return sent;
}

const clock = Date.UTC(2026, 9, 15, 8, 0, 0);
const day = 24 * 60 * 60 * 1000;

function admin(env, method, path, { body, cookie, origin, site, now = clock, type = "application/json" } = {}) {
  const headers = new Headers({ "CF-Connecting-IP": "203.0.113.5" });
  if (body !== undefined) headers.set("Content-Type", type);
  if (cookie) headers.set("Cookie", cookie);
  if (origin) headers.set("Origin", origin);
  if (site) headers.set("Sec-Fetch-Site", site);
  return handleAdmin(new Request(`https://copyboxx.com${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, now);
}

function app(env, method, path, { body, token, now = clock } = {}) {
  const headers = new Headers({ "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.6" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return handleApi(new Request(`https://copyboxx.com${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, now);
}

const codeOf = (mail) => /(\d{6})/.exec(mail.text)[1];

async function adminSignIn(env, sent, email = "owner@example.com", now = clock) {
  assert.equal((await admin(env, "POST", "/admin/api/code", { body: { email }, now })).status, 200);
  const response = await admin(env, "POST", "/admin/api/verify", { body: { email, code: codeOf(sent.at(-1)) }, now });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("Set-Cookie");
  assert.match(cookie, /^__Host-cbx_admin=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200$/);
  return cookie.split(";")[0];
}

test("admin: ADMIN_EMAILS is split on commas and spaces and normalized", () => {
  assert.deepEqual(adminEmails({ ADMIN_EMAILS: " A@B.co ,c@d.io  e@f.cn,,bad" }), ["a@b.co", "c@d.io", "e@f.cn"]);
  assert.deepEqual(adminEmails({}), []);
});

test("admin: the page is served with a strict CSP, no framing and noindex", async () => {
  const env = fakeEnv();
  const redirect = await admin(env, "GET", "/admin");
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("Location"), "/admin/");
  const page = await admin(env, "GET", "/admin/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("Content-Security-Policy"), /script-src 'self'; style-src 'self'.*frame-ancestors 'none'/);
  assert.equal(page.headers.get("X-Frame-Options"), "DENY");
  assert.equal(page.headers.get("X-Robots-Tag"), "noindex, nofollow");
  const html = await page.text();
  assert.match(html, /Copyboxx 后台/);
  assert.doesNotMatch(html, /<script>/, "no inline script, so the CSP holds");
  const script = await admin(env, "GET", "/admin/admin.js");
  assert.equal(script.headers.get("Content-Type"), "text/javascript; charset=utf-8");
  const source = await script.text();
  assert.doesNotMatch(source, /innerHTML/, "emails are user input: only textContent");
  assert.equal((await admin(env, "GET", "/admin/admin.css")).status, 200);
  assert.equal((await admin(env, "GET", "/admin/nope")).status, 404);
});

test("admin: only ADMIN_EMAILS get a code; others get the same answer and no mail", async (t) => {
  const sent = stubMail(t);
  const env = fakeEnv();
  const stranger = await admin(env, "POST", "/admin/api/code", { body: { email: "staff@example.com" } });
  assert.equal(stranger.status, 200);
  assert.deepEqual(await stranger.json(), { ok: true });
  assert.equal(sent.length, 0);
  const cookie = await adminSignIn(env, sent, " OWNER@example.com ");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ["owner@example.com"]);
  // An admin code never creates an app user, and an app code does not open the admin page.
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get().n, 0);
  assert.ok(cookie);
  await app(env, "POST", "/api/auth/code", { body: { email: "owner@example.com" } });
  const appCode = codeOf(sent.at(-1));
  const wrongDoor = await admin(env, "POST", "/admin/api/verify", { body: { email: "owner@example.com", code: appCode } });
  assert.equal(wrongDoor.status, 401);
});

test("admin: wrong codes count, five kill the code, an expired code fails", async (t) => {
  const sent = stubMail(t);
  const env = fakeEnv();
  await admin(env, "POST", "/admin/api/code", { body: { email: "owner@example.com" } });
  const code = codeOf(sent.at(-1));
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i += 1) assert.equal((await admin(env, "POST", "/admin/api/verify", { body: { email: "owner@example.com", code: wrong } })).status, 401);
  assert.equal((await admin(env, "POST", "/admin/api/verify", { body: { email: "owner@example.com", code } })).status, 401);
  await admin(env, "POST", "/admin/api/code", { body: { email: "owner@example.com" } });
  const late = await admin(env, "POST", "/admin/api/verify", { body: { email: "owner@example.com", code: codeOf(sent.at(-1)) }, now: clock + 11 * 60 * 1000 });
  assert.equal(late.status, 401);
});

test("admin: the user list shows sign-in, sync, devices and size, never content", async (t) => {
  const sent = stubMail(t);
  const env = fakeEnv();
  assert.equal((await admin(env, "GET", "/admin/api/users")).status, 401);
  // One staff member signs in on two computers and uploads; another only asked for a code.
  await app(env, "POST", "/api/auth/code", { body: { email: "staff@example.com" } });
  const first = await (await app(env, "POST", "/api/auth/verify", { body: { email: "staff@example.com", code: codeOf(sent.at(-1)), device: "Windows 电脑" } })).json();
  await app(env, "POST", "/api/auth/code", { body: { email: "staff@example.com" }, now: clock + day });
  await app(env, "POST", "/api/auth/verify", { body: { email: "staff@example.com", code: codeOf(sent.at(-1)), device: "<b>Mac</b>" }, now: clock + day });
  assert.equal((await app(env, "PUT", "/api/vault", { body: { baseVersion: 0, data: { secret: "客户密码 hunter2" } }, token: first.token, now: clock + day })).status, 200);
  await app(env, "POST", "/api/auth/code", { body: { email: "typo@example.com" }, now: clock + 2 * day });

  const cookie = await adminSignIn(env, sent, "owner@example.com", clock + 2 * day);
  const response = await admin(env, "GET", "/admin/api/users", { cookie, now: clock + 2 * day });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.doesNotMatch(text, /hunter2|客户密码/);
  const { admin: who, users } = JSON.parse(text);
  assert.equal(who, "owner@example.com");
  assert.deepEqual(users.map((user) => user.email), ["typo@example.com", "staff@example.com"]);
  const [typo, staff] = users;
  assert.equal(typo.lastSignInAt, null);
  assert.equal(typo.devices, 0);
  assert.equal(staff.createdAt, clock);
  assert.equal(staff.lastSignInAt, clock + day);
  assert.equal(staff.lastSyncAt, clock + day);
  assert.equal(staff.devices, 2);
  assert.deepEqual(staff.deviceNames.sort(), ["<b>Mac</b>", "Windows 电脑"].sort());
  assert.equal(staff.version, 1);
  assert.ok(staff.vaultBytes > 13);
});

test("admin: sessions end after 12 hours, on logout, and when the address leaves ADMIN_EMAILS", async (t) => {
  const sent = stubMail(t);
  const env = fakeEnv();
  const cookie = await adminSignIn(env, sent);
  assert.equal((await admin(env, "GET", "/admin/api/users", { cookie, now: clock + 11 * 60 * 60 * 1000 })).status, 200);
  assert.equal((await admin(env, "GET", "/admin/api/users", { cookie, now: clock + 12 * 60 * 60 * 1000 })).status, 401);

  const again = await adminSignIn(env, sent);
  const out = await admin(env, "POST", "/admin/api/logout", { cookie: again, body: {} });
  assert.equal(out.status, 200);
  assert.match(out.headers.get("Set-Cookie"), /Max-Age=0/);
  assert.equal((await admin(env, "GET", "/admin/api/users", { cookie: again })).status, 401);

  const third = await adminSignIn(env, sent, "second@example.com");
  env.ADMIN_EMAILS = "owner@example.com";
  assert.equal((await admin(env, "GET", "/admin/api/users", { cookie: third })).status, 401);
  assert.equal((await admin(env, "GET", "/admin/api/users", { cookie: "__Host-cbx_admin=made-up-token-made-up-token" })).status, 401);
});

test("admin: other sites, non-JSON posts and a missing setup are refused", async (t) => {
  const sent = stubMail(t);
  const env = fakeEnv();
  assert.equal((await admin(env, "POST", "/admin/api/code", { body: { email: "owner@example.com" }, origin: "https://evil.example" })).status, 403);
  assert.equal((await admin(env, "POST", "/admin/api/code", { body: { email: "owner@example.com" }, site: "cross-site" })).status, 403);
  assert.equal((await admin(env, "POST", "/admin/api/code", { body: { email: "owner@example.com" }, type: "text/plain" })).status, 400);
  assert.equal(sent.length, 0);
  assert.equal((await admin(env, "POST", "/admin/api/code", { body: { email: "owner@example.com" }, origin: "https://copyboxx.com" })).status, 200);
  assert.equal((await admin(env, "DELETE", "/admin/api/users")).status, 405);
  for (const missing of ["DB", "RESEND_API_KEY", "ADMIN_EMAILS"]) {
    const broken = fakeEnv({ [missing]: undefined });
    assert.equal((await admin(broken, "POST", "/admin/api/code", { body: { email: "owner@example.com" } })).status, 503);
  }
});

test("admin: the worker routes /admin with HSTS and keeps the rest of the site", async (t) => {
  stubMail(t);
  const env = fakeEnv({ FILES: { getWithMetadata: async () => ({ value: null, metadata: null }) } });
  const page = await worker.fetch(new Request("https://copyboxx.com/admin/"), env);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("Strict-Transport-Security"), "max-age=15552000");
  const post = await worker.fetch(
    new Request("https://copyboxx.com/admin/api/code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "x@example.com" }) }),
    env,
  );
  assert.equal(post.status, 200);
  assert.equal((await worker.fetch(new Request("https://copyboxx.com/administrator"), env)).status, 404);
});
