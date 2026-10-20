import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { deviceName, emailDomain, handleApi, normalizeActivationCode, normalizeEmail, randomActivationCode, randomCode } from "../tools/website/api.mjs";
import worker from "../tools/website/worker.mjs";

// D1 stand-in on an in-memory SQLite database with the real schema.sql: prepare().bind().first()/run()/all().
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

function fakeR2() {
  const objects = new Map();
  return {
    objects,
    failPut: false,
    async get(key) {
      const bytes = objects.get(key);
      return bytes ? { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } : null;
    },
    async put(key, value) {
      if (this.failPut) throw new Error("R2 down");
      objects.set(key, new Uint8Array(value));
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

function fakeEnv(extra = {}) {
  return {
    DB: fakeD1(),
    VAULTS: fakeR2(),
    RESEND_API_KEY: "re_test_key",
    VAULT_KEY: Buffer.alloc(32, 7).toString("base64"),
    ...extra,
  };
}

// Replaces global fetch for Resend for the length of one test; returns the list of sent mails.
function stubMail(t, { ok = true } = {}) {
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    sent.push({ headers: init.headers, body: JSON.parse(init.body) });
    return new Response("{}", { status: ok ? 200 : 500 });
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return sent;
}

const clock = Date.UTC(2026, 9, 15, 8, 0, 0);
const day = 24 * 60 * 60 * 1000;

function call(env, method, path, { body, token, origin, ip = "203.0.113.1", now = clock, raw } = {}) {
  const headers = new Headers();
  if (body !== undefined || raw !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (origin) headers.set("Origin", origin);
  if (ip) headers.set("CF-Connecting-IP", ip);
  const init = { method, headers };
  if (raw !== undefined) init.body = raw;
  else if (body !== undefined) init.body = JSON.stringify(body);
  return handleApi(new Request(`https://copyboxx.com${path}`, init), env, now);
}

function codeFrom(mail) {
  return /(\d{6})/.exec(mail.body.text)[1];
}

// Marks the email as activated (D-086) the way a redeemed code does, so the sync tests are not about activation.
function activateEmail(env, email) {
  env.DB.sqlite.prepare("INSERT OR IGNORE INTO activation_codes (code_hash, hint, created_at, email, used_at) VALUES (?, 'TEST', ?, ?, ?)")
    .run(`hash-for-${normalizeEmail(email)}`, clock, normalizeEmail(email), clock);
}

async function signIn(env, sent, email = "Staff@Example.com ", { activated = true } = {}) {
  const asked = await call(env, "POST", "/api/auth/code", { body: { email } });
  assert.equal(asked.status, 200);
  const code = codeFrom(sent.at(-1));
  const verified = await call(env, "POST", "/api/auth/verify", { body: { email, code, device: "Windows 电脑" } });
  assert.equal(verified.status, 200);
  if (activated) activateEmail(env, email);
  return (await verified.json()).token;
}

const count = (env, table) => env.DB.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test("api: emails are trimmed, lower-cased and checked; codes are six digits; device names are short", () => {
  assert.equal(normalizeEmail("  Staff@Example.COM "), "staff@example.com");
  assert.equal(normalizeEmail("no-at-sign"), null);
  assert.equal(normalizeEmail("a@b"), null);
  assert.equal(normalizeEmail(`${"a".repeat(115)}@b.com`), null);
  assert.equal(normalizeEmail(42), null);
  for (let i = 0; i < 50; i += 1) assert.match(randomCode(), /^\d{6}$/);
  assert.equal(deviceName("  Windows 电脑 "), "Windows 电脑");
  assert.equal(deviceName("电".repeat(50)), "电".repeat(40));
  assert.equal(deviceName("   "), null);
  assert.equal(deviceName(undefined), null);
});

test("api: request a code, then sign in with it", async (t) => {
  const env = fakeEnv();
  const sent = stubMail(t);
  const response = await call(env, "POST", "/api/auth/code", { body: { email: " Staff@Example.com" } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].body.to, ["staff@example.com"]);
  assert.equal(sent[0].body.from, "Copyboxx <noreply@copyboxx.com>");
  assert.equal(sent[0].headers.Authorization, "Bearer re_test_key");
  assert.match(sent[0].body.subject, /验证码/);
  assert.match(sent[0].body.html, /\d{6}/);
  const code = codeFrom(sent[0]);

  const stored = env.DB.sqlite.prepare("SELECT * FROM login_codes").all();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].email, "staff@example.com");
  assert.equal(stored[0].code_hash, createHash("sha256").update(`staff@example.com:${code}`).digest("hex"));
  assert.equal(stored[0].expires_at, clock + 10 * 60 * 1000);
  assert.equal(stored[0].attempts, 0);
  assert.equal(count(env, "users"), 0, "asking for a code creates no user; signing in does (D-094)");

  const verified = await call(env, "POST", "/api/auth/verify", { body: { email: "STAFF@example.com", code, device: "  Mac 电脑  " } });
  assert.equal(verified.status, 200);
  const { token, email } = await verified.json();
  assert.equal(email, "staff@example.com");
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(count(env, "login_codes"), 0, "the code is used up");
  const session = env.DB.sqlite.prepare("SELECT * FROM sessions").get();
  assert.equal(session.token_hash, createHash("sha256").update(token).digest("hex"));
  assert.equal(session.expires_at, clock + 90 * day);
  assert.equal(session.device, "Mac 电脑");
  assert.equal(env.DB.sqlite.prepare("SELECT email FROM users").get().email, "staff@example.com");

  const again = await call(env, "POST", "/api/auth/verify", { body: { email: "staff@example.com", code } });
  assert.equal(again.status, 401, "a code signs in only once");
  assert.equal((await again.json()).error, "bad_code");
});

test("api: five wrong codes kill the code; wrong, expired and unknown all get the same answer", async (t) => {
  const env = fakeEnv();
  const sent = stubMail(t);
  await call(env, "POST", "/api/auth/code", { body: { email: "a@example.com" } });
  const code = codeFrom(sent[0]);
  const wrongCode = code === "000000" ? "111111" : "000000";
  const answers = [];
  for (let i = 0; i < 5; i += 1) {
    const response = await call(env, "POST", "/api/auth/verify", { body: { email: "a@example.com", code: wrongCode } });
    assert.equal(response.status, 401);
    answers.push(await response.json());
  }
  const dead = await call(env, "POST", "/api/auth/verify", { body: { email: "a@example.com", code } });
  assert.equal(dead.status, 401, "the right code no longer works after five wrong tries");
  answers.push(await dead.json());

  const unknown = await call(env, "POST", "/api/auth/verify", { body: { email: "nobody@example.com", code: "123456" } });
  assert.equal(unknown.status, 401);
  answers.push(await unknown.json());

  await call(env, "POST", "/api/auth/code", { body: { email: "late@example.com" } });
  const expired = await call(env, "POST", "/api/auth/verify", {
    body: { email: "late@example.com", code: codeFrom(sent.at(-1)) },
    now: clock + 10 * 60 * 1000 + 1,
  });
  assert.equal(expired.status, 401);
  answers.push(await expired.json());

  for (const answer of answers) assert.deepEqual(answer, answers[0]);
  assert.equal(answers[0].error, "bad_code");
  assert.match(answers[0].message, /验证码/);
  assert.equal(count(env, "sessions"), 0);
});

test("api: a new email and a registered one get the same answer; malformed email is 400", async (t) => {
  const env = fakeEnv();
  stubMail(t);
  const first = await call(env, "POST", "/api/auth/code", { body: { email: "new@example.com" } });
  const second = await call(env, "POST", "/api/auth/code", { body: { email: "new@example.com" } });
  assert.equal(first.status, second.status);
  assert.deepEqual(await first.json(), await second.json());
  assert.equal(count(env, "users"), 0);
  const bad = await call(env, "POST", "/api/auth/code", { body: { email: "not an email" } });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, "bad_email");
  assert.equal((await call(env, "POST", "/api/auth/code", { raw: "{oops" })).status, 400);
});

test("api: at most 5 codes per email from one IP, 20 per email in all, and 20 requests per IP each hour (D-100)", async (t) => {
  const env = fakeEnv();
  const sent = stubMail(t);
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: "a@example.com" }, ip: "198.51.100.1" })).status, 200);
  }
  const limited = await call(env, "POST", "/api/auth/code", { body: { email: "a@example.com" }, ip: "198.51.100.1" });
  assert.equal(limited.status, 429);
  const limitedBody = await limited.json();
  assert.equal(limitedBody.error, "rate_limited");
  assert.match(limitedBody.message, /频繁/);
  assert.equal(sent.length, 5);
  // Someone else asking for this email does not lock its owner out: the owner's own IP still gets codes.
  assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: "a@example.com" }, ip: "198.51.100.2" })).status, 200);
  for (let i = 3; i < 17; i += 1) {
    assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: "a@example.com" }, ip: `198.51.100.${i}` })).status, 200);
  }
  assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: "a@example.com" }, ip: "198.51.100.50" })).status, 429, "20 codes an hour per email in all");
  const nextHour = await call(env, "POST", "/api/auth/code", { body: { email: "a@example.com" }, ip: "198.51.100.1", now: clock + 60 * 60 * 1000 + 1 });
  assert.equal(nextHour.status, 200, "the limit resets after an hour");

  for (let i = 0; i < 20; i += 1) {
    assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: `p${i}@example.com` }, ip: "192.0.2.7" })).status, 200);
  }
  assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: "p99@example.com" }, ip: "192.0.2.7" })).status, 429);
});

test("api: emails that are not activated get at most 50 mails a day in all; activated ones are never held back (D-100)", async (t) => {
  const env = fakeEnv();
  const sent = stubMail(t);
  activateEmail(env, "staff@example.com");
  for (let i = 0; i < 50; i += 1) {
    assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: `r${i}@example.com` }, ip: `198.51.100.${i}` })).status, 200);
  }
  assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: "r99@example.com" }, ip: "192.0.2.50" })).status, 429);
  assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: "staff@example.com" }, ip: "192.0.2.51" })).status, 200);
  assert.equal(sent.length, 51);
  const later = clock + 2 * 60 * 60 * 1000;
  // An allowed request later the same day sweeps old counters; the daily one must survive that.
  assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: "staff@example.com" }, ip: "192.0.2.53", now: later })).status, 200);
  assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: "r99@example.com" }, ip: "192.0.2.52", now: later })).status, 429, "still the same day");
  const tomorrow = clock + 24 * 60 * 60 * 1000 + 1;
  assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: "r99@example.com" }, ip: "192.0.2.52", now: tomorrow })).status, 200);
});

test("api: a burst of parallel requests cannot get past the hourly limits (D-094)", async (t) => {
  const env = fakeEnv();
  const sent = stubMail(t);
  const burst = await Promise.all(
    Array.from({ length: 30 }, (_, i) => call(env, "POST", "/api/auth/code", { body: { email: `b${i}@example.com` }, ip: "192.0.2.8" })),
  );
  assert.equal(burst.filter((response) => response.status === 200).length, 20);
  assert.equal(sent.length, 20);

  // Parallel guesses: only 5 are ever compared, so the right code sent 10th in the burst is refused.
  await call(env, "POST", "/api/auth/code", { body: { email: "c@example.com" } });
  const code = codeFrom(sent.at(-1));
  const wrongCode = code === "000000" ? "111111" : "000000";
  const guesses = await Promise.all(
    [...Array(9).fill(wrongCode), code].map((guess, i) => call(env, "POST", "/api/auth/verify", { body: { email: "c@example.com", code: guess }, ip: `198.51.100.${i}` })),
  );
  assert.deepEqual(
    guesses.map((response) => response.status),
    Array(10).fill(401),
  );
  assert.equal(count(env, "sessions"), 0);
});

test("api: at most 30 sign-in tries per IP each hour, so one sender cannot keep killing someone's code (D-094)", async (t) => {
  const env = fakeEnv();
  const sent = stubMail(t);
  for (let i = 0; i < 30; i += 1) {
    assert.equal((await call(env, "POST", "/api/auth/verify", { body: { email: "victim@example.com", code: "000000" }, ip: "192.0.2.9" })).status, 401);
  }
  await call(env, "POST", "/api/auth/code", { body: { email: "victim@example.com" } });
  assert.equal((await call(env, "POST", "/api/auth/verify", { body: { email: "victim@example.com", code: "000000" }, ip: "192.0.2.9" })).status, 429);
  const own = await call(env, "POST", "/api/auth/verify", { body: { email: "victim@example.com", code: codeFrom(sent.at(-1)) } });
  assert.equal(own.status, 200, "the refused guess did not use up a try of the real code");
});

test("api: no Resend key means 503; a failed send is reported and leaves no code", async (t) => {
  const noKey = fakeEnv({ RESEND_API_KEY: undefined });
  const unavailable = await call(noKey, "POST", "/api/auth/code", { body: { email: "a@example.com" } });
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error, "unavailable");
  const env = fakeEnv();
  stubMail(t, { ok: false });
  const failed = await call(env, "POST", "/api/auth/code", { body: { email: "a@example.com" } });
  assert.equal(failed.status, 502);
  assert.equal(count(env, "login_codes"), 0);
});

test("api: vault starts empty, takes an upload and gives it back; the R2 copy is not readable", async (t) => {
  const env = fakeEnv();
  const sent = stubMail(t);
  const token = await signIn(env, sent);
  const empty = await call(env, "GET", "/api/vault", { token });
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { version: 0, updatedAt: null, data: null });

  const data = { snippets: [{ title: "问候", content: "您好，欢迎咨询 secret-marker" }], accounts: [] };
  const put = await call(env, "PUT", "/api/vault", { token, body: { baseVersion: 0, data }, now: clock + 5 });
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { version: 1 });

  const got = await call(env, "GET", "/api/vault", { token });
  assert.deepEqual(await got.json(), { version: 1, updatedAt: clock + 5, data });

  const userId = env.DB.sqlite.prepare("SELECT id FROM users").get().id;
  const blob = env.VAULTS.objects.get(`vaults/${userId}.json`);
  assert.ok(blob, "stored under vaults/<user id>.json");
  const asText = Buffer.from(blob).toString("latin1");
  assert.ok(!asText.includes("secret-marker") && !asText.includes("snippets"), "the stored blob is encrypted");
  assert.ok(!Buffer.from(blob).toString("utf8").includes("您好"));
  assert.equal(env.DB.sqlite.prepare("SELECT last_sync_at FROM users").get().last_sync_at, clock + 5);

  const second = await call(env, "PUT", "/api/vault", { token, body: { baseVersion: 1, data: { v: 2 } } });
  assert.deepEqual(await second.json(), { version: 2 });
  assert.deepEqual((await (await call(env, "GET", "/api/vault", { token })).json()).data, { v: 2 });

  const otherKey = { ...env, VAULT_KEY: Buffer.alloc(32, 9).toString("base64") };
  assert.equal((await call(otherKey, "GET", "/api/vault", { token })).status, 500, "another server key cannot read it");
  const noKey = { ...env, VAULT_KEY: undefined };
  assert.equal((await call(noKey, "GET", "/api/vault", { token })).status, 503);
  const noKeyPut = await call(noKey, "PUT", "/api/vault", { token, body: { baseVersion: 2, data: {} } });
  assert.equal(noKeyPut.status, 503);
  assert.equal((await noKeyPut.json()).error, "unavailable");
});

test("api: an upload from an old version is refused with 409 and the current version; data must be an object", async (t) => {
  const env = fakeEnv();
  const sent = stubMail(t);
  const token = await signIn(env, sent);
  await call(env, "PUT", "/api/vault", { token, body: { baseVersion: 0, data: { n: "first" } } });
  for (const baseVersion of [0, 2, 7]) {
    const stale = await call(env, "PUT", "/api/vault", { token, body: { baseVersion, data: { n: "lost" } } });
    assert.equal(stale.status, 409);
    const answer = await stale.json();
    assert.equal(answer.error, "version_conflict");
    assert.equal(answer.version, 1);
  }
  assert.deepEqual((await (await call(env, "GET", "/api/vault", { token })).json()).data, { n: "first" });
  assert.equal((await call(env, "PUT", "/api/vault", { token, body: { baseVersion: "1", data: {} } })).status, 400);
  for (const data of [5, "text", null, [1, 2], undefined]) {
    const bad = await call(env, "PUT", "/api/vault", { token, body: { baseVersion: 1, data } });
    assert.equal(bad.status, 400, JSON.stringify(data));
    assert.equal((await bad.json()).error, "bad_data");
  }
});

test("api: a failed R2 write gives the version back", async (t) => {
  const env = fakeEnv();
  const sent = stubMail(t);
  const token = await signIn(env, sent);
  env.VAULTS.failPut = true;
  assert.equal((await call(env, "PUT", "/api/vault", { token, body: { baseVersion: 0, data: {} } })).status, 500);
  env.VAULTS.failPut = false;
  assert.deepEqual(await (await call(env, "PUT", "/api/vault", { token, body: { baseVersion: 0, data: {} } })).json(), { version: 1 });
  env.VAULTS.failPut = true;
  assert.equal((await call(env, "PUT", "/api/vault", { token, body: { baseVersion: 1, data: {} } })).status, 500);
  env.VAULTS.failPut = false;
  assert.deepEqual(await (await call(env, "PUT", "/api/vault", { token, body: { baseVersion: 1, data: {} } })).json(), { version: 2 });
});

test("api: uploads over 5 MB get 413", async (t) => {
  const env = fakeEnv();
  const sent = stubMail(t);
  const token = await signIn(env, sent);
  const big = JSON.stringify({ baseVersion: 0, data: { text: "x".repeat(5 * 1024 * 1024) } });
  const refused = await call(env, "PUT", "/api/vault", { token, raw: big });
  assert.equal(refused.status, 413);
  assert.equal((await refused.json()).error, "too_large");
  const fits = JSON.stringify({ baseVersion: 0, data: { text: "x".repeat(4 * 1024 * 1024) } });
  assert.equal((await call(env, "PUT", "/api/vault", { token, raw: fits })).status, 200);
});

test("api: missing, wrong or expired sign-in is 401", async (t) => {
  const env = fakeEnv();
  const sent = stubMail(t);
  assert.equal((await call(env, "GET", "/api/vault")).status, 401);
  assert.equal((await call(env, "GET", "/api/vault", { token: "A".repeat(43) })).status, 401);
  assert.equal((await call(env, "PUT", "/api/vault", { body: { baseVersion: 0, data: {} } })).status, 401);
  assert.equal((await call(env, "POST", "/api/auth/logout")).status, 401);
  assert.equal((await call(env, "DELETE", "/api/account")).status, 401);
  const token = await signIn(env, sent);
  const expired = await call(env, "GET", "/api/vault", { token, now: clock + 90 * day + 1 });
  assert.equal(expired.status, 401);
  const answer = await expired.json();
  assert.equal(answer.error, "unauthorized");
  assert.match(answer.message, /登录/);
});

test("api: logout ends only that session", async (t) => {
  const env = fakeEnv();
  const sent = stubMail(t);
  const one = await signIn(env, sent);
  const two = await signIn(env, sent);
  assert.deepEqual(await (await call(env, "POST", "/api/auth/logout", { token: one })).json(), { ok: true });
  assert.equal((await call(env, "GET", "/api/vault", { token: one })).status, 401);
  assert.equal((await call(env, "GET", "/api/vault", { token: two })).status, 200);
});

async function signInAs(env, sent, device, now) {
  const email = "staff@example.com";
  activateEmail(env, email);
  assert.equal((await call(env, "POST", "/api/auth/code", { body: { email }, now })).status, 200);
  const verified = await call(env, "POST", "/api/auth/verify", { body: { email, code: codeFrom(sent.at(-1)), device }, now });
  assert.equal(verified.status, 200);
  return verified.json();
}

test("api: at most 3 computers per account; a 4th sign-in ends the oldest and says which", async (t) => {
  const env = fakeEnv();
  const sent = stubMail(t);
  const first = await signInAs(env, sent, "Windows 电脑", clock);
  assert.deepEqual(first.signedOut, []);
  const second = await signInAs(env, sent, "Mac 电脑", clock + day);
  const third = await signInAs(env, sent, undefined, clock + 2 * day);
  assert.deepEqual(third.signedOut, []);
  assert.equal(count(env, "sessions"), 3);

  const fourth = await signInAs(env, sent, "新的 Windows 电脑", clock + 3 * day);
  assert.deepEqual(fourth.signedOut, ["Windows 电脑"]);
  assert.equal(count(env, "sessions"), 3);
  const later = clock + 3 * day + 1;
  const ended = await call(env, "GET", "/api/vault", { token: first.token, now: later });
  assert.equal(ended.status, 401);
  const answer = await ended.json();
  assert.equal(answer.error, "device_limit");
  assert.match(answer.message, /最多同时登录 3 台电脑/);
  for (const still of [second, third, fourth]) assert.equal((await call(env, "GET", "/api/vault", { token: still.token, now: later })).status, 200);

  // The next one ends the unnamed oldest, and a computer that signed out by itself is not counted.
  assert.equal((await call(env, "POST", "/api/auth/logout", { token: second.token, now: later })).status, 200);
  const fifth = await signInAs(env, sent, "Mac 电脑", clock + 4 * day);
  assert.deepEqual(fifth.signedOut, []);
  const sixth = await signInAs(env, sent, "Mac 电脑", clock + 5 * day);
  assert.deepEqual(sixth.signedOut, ["一台电脑"]);

  // Once the old token would have expired anyway, it is forgotten and answers like any unknown token.
  await call(env, "POST", "/api/auth/code", { body: { email: "other@example.com" }, now: clock + 91 * day });
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM ended_sessions WHERE expires_at <= ?").get(clock + 91 * day).n, 0);
  assert.equal((await (await call(env, "GET", "/api/vault", { token: first.token, now: clock + 91 * day })).json()).error, "unauthorized");
});

test("api: before ended_sessions exists the device limit still holds, the old computer just hears 请重新登录", async (t) => {
  const env = fakeEnv();
  env.DB.sqlite.exec("DROP TABLE ended_sessions");
  const sent = stubMail(t);
  const first = await signInAs(env, sent, "Windows 电脑", clock);
  for (let i = 1; i <= 3; i += 1) await signInAs(env, sent, "Mac 电脑", clock + i * day);
  assert.equal(count(env, "sessions"), 3);
  assert.equal((await (await call(env, "GET", "/api/vault", { token: first.token, now: clock + 4 * day })).json()).error, "unauthorized");
});

test("api: deleting the account removes the user, sessions, codes and the R2 blob", async (t) => {
  const env = fakeEnv();
  const sent = stubMail(t);
  const token = await signIn(env, sent);
  const other = await signIn(env, sent, "other@example.com");
  await call(env, "PUT", "/api/vault", { token, body: { baseVersion: 0, data: { who: "mine" } } });
  await call(env, "PUT", "/api/vault", { token: other, body: { baseVersion: 0, data: { who: "theirs" } } });
  await call(env, "POST", "/api/auth/code", { body: { email: "staff@example.com" } });
  const deleted = await call(env, "DELETE", "/api/account", { token });
  assert.deepEqual(await deleted.json(), { ok: true });
  assert.equal(count(env, "users"), 1);
  assert.equal(count(env, "sessions"), 1);
  assert.equal(count(env, "login_codes"), 0);
  assert.equal(count(env, "vault_meta"), 1);
  assert.equal(env.VAULTS.objects.size, 1);
  assert.equal((await call(env, "GET", "/api/vault", { token })).status, 401);
  assert.equal((await (await call(env, "GET", "/api/vault", { token: other })).json()).data.who, "theirs");
});

test("api: without the D1 binding every /api path answers 503", async (t) => {
  const sent = stubMail(t);
  for (const env of [fakeEnv({ DB: undefined }), {}]) {
    for (const [method, path] of [["POST", "/api/auth/code"], ["POST", "/api/auth/verify"], ["GET", "/api/vault"], ["PUT", "/api/vault"], ["POST", "/api/auth/logout"], ["DELETE", "/api/account"]]) {
      const response = await call(env, method, path, { body: method === "GET" ? undefined : { email: "a@example.com" } });
      assert.equal(response.status, 503, `${method} ${path}`);
      assert.equal((await response.json()).error, "unavailable");
    }
  }
  assert.equal(sent.length, 0);
});

test("api: a database error answers JSON storage_error, not Cloudflare's error page (D-094)", async () => {
  const env = fakeEnv({ DB: { prepare: () => { throw new Error("D1 down"); } } });
  const response = await call(env, "POST", "/api/auth/verify", { body: { email: "a@example.com", code: "123456" } });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "storage_error");
});

test("api: unknown paths are a JSON 404, wrong methods a 405", async () => {
  const env = fakeEnv();
  const missing = await call(env, "GET", "/api/nothing");
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get("Content-Type"), /application\/json/);
  assert.equal((await missing.json()).error, "not_found");
  assert.equal((await call(env, "GET", "/api")).status, 404);
  const wrong = await call(env, "GET", "/api/auth/code");
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.get("Allow"), "POST, OPTIONS");
});

test("api: no CORS headers, so a browser page cannot read /api answers", async (t) => {
  const env = fakeEnv();
  const sent = stubMail(t);
  const token = await signIn(env, sent);
  const answers = [
    await call(env, "OPTIONS", "/api/vault", { origin: "https://evil.example" }),
    await call(env, "OPTIONS", "/api/auth/code", { origin: "tauri://localhost" }),
    await call(env, "POST", "/api/auth/code", { body: { email: "a@example.com" }, origin: "https://evil.example" }),
    await call(env, "GET", "/api/vault", { token, origin: "http://tauri.localhost" }),
    await call(env, "GET", "/api/nothing", { origin: "https://evil.example" }),
    await call({}, "GET", "/api/vault", { origin: "https://evil.example" }),
  ];
  assert.equal(answers[0].status, 204);
  assert.equal(answers[0].headers.get("Allow"), "GET, PUT, OPTIONS");
  for (const response of answers) {
    for (const [name] of response.headers) assert.ok(!name.toLowerCase().startsWith("access-control-"), `${response.status} carries ${name}`);
  }
});

test("api: the worker routes /api/ before the GET-only rule, and keeps the site and HSTS", async (t) => {
  const sent = stubMail(t);
  const env = fakeEnv({
    FILES: {
      async getWithMetadata(key) {
        return key === "index.html" ? { value: "<title>home</title>", metadata: { type: "text/html; charset=utf-8" } } : { value: null, metadata: null };
      },
    },
  });
  const viaWorker = await worker.fetch(
    new Request("https://copyboxx.com/api/auth/code", { method: "POST", body: JSON.stringify({ email: "a@example.com" }), headers: { "CF-Connecting-IP": "203.0.113.9" } }),
    env,
  );
  assert.equal(viaWorker.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(viaWorker.headers.get("Strict-Transport-Security"), "max-age=15552000");

  const unavailable = await worker.fetch(new Request("https://copyboxx.com/api/vault"), { FILES: env.FILES });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("Strict-Transport-Security"), "max-age=15552000");

  const home = await worker.fetch(new Request("https://copyboxx.com/"), env);
  assert.equal(home.status, 200);
  assert.equal(await home.text(), "<title>home</title>");
  assert.equal(home.headers.get("Strict-Transport-Security"), "max-age=15552000");
  const post = await worker.fetch(new Request("https://copyboxx.com/", { method: "POST" }), env);
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("Strict-Transport-Security"), "max-age=15552000");
  const plain = await worker.fetch(new Request("http://copyboxx.com/api/vault"), env);
  assert.equal(plain.status, 301);
});

test("api: without an R2 bucket the encrypted blob is kept in D1, capped below its 2 MB row limit", async (t) => {
  const env = fakeEnv({ VAULTS: undefined });
  const sent = stubMail(t);
  const token = await signIn(env, sent);
  const data = { snippets: [{ title: "问候", content: "secret-marker" }] };
  assert.deepEqual(await (await call(env, "PUT", "/api/vault", { token, body: { baseVersion: 0, data } })).json(), { version: 1 });
  assert.deepEqual((await (await call(env, "GET", "/api/vault", { token })).json()).data, data);
  const row = env.DB.sqlite.prepare("SELECT data FROM vault_blobs").get();
  assert.ok(!Buffer.from(row.data).toString("latin1").includes("secret-marker"), "the D1 copy is encrypted");
  const big = await call(env, "PUT", "/api/vault", { token, body: { baseVersion: 1, data: { text: "x".repeat(2_000_000) } } });
  assert.equal(big.status, 413);
  assert.equal((await big.json()).error, "too_large");
  assert.equal((await (await call(env, "DELETE", "/api/account", { token })).json()).ok, true);
  assert.equal(env.DB.sqlite.prepare("SELECT count(*) AS n FROM vault_blobs").get().n, 0);
});

// ---- company 话术 by email domain: GET /api/library ----

// KV stand-in with get(key) → text or null, as the FILES binding answers.
function fakeKv(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    reads: [],
    async get(key) {
      this.reads.push(key);
      return store.has(key) ? store.get(key) : null;
    },
  };
}

const companyLibrary = { format: "clipbox-shared-library", version: 1, items: [{ id: "CO-1", label: "公司 · 问候", secret: "您好" }] };

function libraryEnv(files) {
  return fakeEnv({ FILES: fakeKv(files) });
}

async function library(env, token) {
  const response = await call(env, "GET", "/api/library", { token });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

test("api: the email domain is the text after the last @, lower-cased; not a domain gives null", () => {
  assert.equal(emailDomain("a@Company.COM"), "company.com");
  assert.equal(emailDomain('"x@y"@sales.company.com'), "sales.company.com");
  assert.equal(emailDomain("a@localhost"), null);
  assert.equal(emailDomain("no-at-sign"), null);
  assert.equal(emailDomain(null), null);
});

test("api: GET /api/library gives the library bound to the account's email domain", async (t) => {
  const sent = stubMail(t);
  const env = libraryEnv({ "domains/company.com": "xs-7kq2m9ab\n", "sync/XS-7KQ2M9AB/snippets.json": JSON.stringify(companyLibrary) });
  const token = await signIn(env, sent, "Staff@Company.com");
  const answer = await library(env, token);
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body, { domain: "company.com", library: companyLibrary });
  assert.equal(answer.headers.get("Cache-Control"), "no-store");
  for (const [name] of answer.headers) assert.ok(!name.toLowerCase().startsWith("access-control-"), `carries ${name}`);

  // Read on every request: unbinding takes effect at once.
  env.FILES.store.delete("domains/company.com");
  assert.deepEqual((await library(env, token)).body, { domain: null, library: null });
});

test("api: GET /api/library answers nulls when there is nothing to give", async (t) => {
  const sent = stubMail(t);
  const live = JSON.stringify(companyLibrary);
  const cases = [
    ["unbound domain", { "sync/XS-7KQ2M9AB/snippets.json": live }, "a@other.com"],
    ["free-mail domain bound anyway", { "domains/gmail.com": "XS-7KQ2M9AB", "sync/XS-7KQ2M9AB/snippets.json": live }, "a@gmail.com"],
    ["free-mail country version", { "domains/hotmail.fr": "XS-7KQ2M9AB", "sync/XS-7KQ2M9AB/snippets.json": live }, "a@hotmail.fr"],
    ["subdomain of a bound domain", { "domains/company.com": "XS-7KQ2M9AB", "sync/XS-7KQ2M9AB/snippets.json": live }, "a@sales.company.com"],
    ["bound code has no library", { "domains/company.com": "XS-7KQ2M9AB" }, "a@company.com"],
    ["library is not valid JSON", { "domains/company.com": "XS-7KQ2M9AB", "sync/XS-7KQ2M9AB/snippets.json": "{not json" }, "a@company.com"],
    ["library is a bare string", { "domains/company.com": "XS-7KQ2M9AB", "sync/XS-7KQ2M9AB/snippets.json": '"text"' }, "a@company.com"],
    ["binding is not a code", { "domains/company.com": "../../x", "sync/XS-7KQ2M9AB/snippets.json": live }, "a@company.com"],
  ];
  for (const [name, files, email] of cases) {
    const env = libraryEnv(files);
    const token = await signIn(env, sent, email);
    const answer = await library(env, token);
    assert.equal(answer.status, 200, name);
    assert.deepEqual(answer.body, { domain: null, library: null }, name);
  }
  const noFiles = fakeEnv();
  const token = await signIn(noFiles, sent, "a@company.com");
  assert.deepEqual((await library(noFiles, token)).body, { domain: null, library: null }, "no FILES binding");
});

test("api: GET /api/library never reads KV for a free-mail account; a failing KV read is a 500", async (t) => {
  const sent = stubMail(t);
  const env = libraryEnv({ "domains/qq.com": "XS-7KQ2M9AB" });
  const token = await signIn(env, sent, "a@qq.com");
  await library(env, token);
  assert.deepEqual(env.FILES.reads, []);

  const broken = fakeEnv({ FILES: { async get() { throw new Error("KV down"); } } });
  const other = await signIn(broken, sent, "a@company.com");
  const answer = await library(broken, other);
  assert.equal(answer.status, 500);
  assert.equal(answer.body.error, "storage_error");
});

test("api: GET /api/library needs a sign-in (401), only allows GET (405) and needs D1 (503)", async (t) => {
  const sent = stubMail(t);
  const env = libraryEnv({ "domains/company.com": "XS-7KQ2M9AB", "sync/XS-7KQ2M9AB/snippets.json": JSON.stringify(companyLibrary) });
  const missing = await call(env, "GET", "/api/library");
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error, "unauthorized");
  assert.equal((await call(env, "GET", "/api/library", { token: "A".repeat(43) })).status, 401);
  const token = await signIn(env, sent, "a@company.com");
  for (const method of ["POST", "PUT", "DELETE"]) {
    const wrong = await call(env, method, "/api/library", { token });
    assert.equal(wrong.status, 405, method);
    assert.equal(wrong.headers.get("Allow"), "GET, OPTIONS");
  }
  const unavailable = await call(fakeEnv({ DB: undefined, FILES: env.FILES }), "GET", "/api/library", { token });
  assert.equal(unavailable.status, 503);
});

// ---- 人机验证 and activation (D-086) ----

// Replaces fetch for Resend and Turnstile: `captcha` says what siteverify answers; returns the calls made.
function stubMailAndTurnstile(t, captcha = true) {
  const calls = { mails: [], verifies: [] };
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (url === "https://api.resend.com/emails") {
      calls.mails.push({ headers: init.headers, body: JSON.parse(init.body) });
      return new Response("{}", { status: 200 });
    }
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    calls.verifies.push(Object.fromEntries(new URLSearchParams(init.body)));
    return new Response(JSON.stringify({ success: captcha }), { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

test("api: with TURNSTILE_SECRET set, the first 3 code requests an hour need no token; from the 4th on, an email or an IP must pass Turnstile (D-087)", async (t) => {
  const env = fakeEnv({ TURNSTILE_SECRET: "0x-secret" });
  const calls = stubMailAndTurnstile(t);
  // One email, three computers: no 人机验证.
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: "a@example.com" }, ip: `198.51.100.${i}` })).status, 200);
  }
  assert.deepEqual(calls.verifies, []);
  assert.equal(calls.mails.length, 3);
  // The 4th request for this email needs a token Cloudflare accepts; refusals do not use up the email's codes.
  for (const body of [{ email: "a@example.com" }, { email: "a@example.com", turnstile: "" }, { email: "a@example.com", turnstile: 7 }]) {
    const refused = await call(env, "POST", "/api/auth/code", { body, ip: "198.51.100.9" });
    assert.equal(refused.status, 400);
    assert.deepEqual(await refused.json(), { error: "captcha", message: "请先完成人机验证" });
  }
  assert.deepEqual(calls.verifies, []);
  assert.equal(calls.mails.length, 3);
  const ok = await call(env, "POST", "/api/auth/code", { body: { email: "a@example.com", turnstile: "tok-123" }, ip: "198.51.100.9" });
  assert.equal(ok.status, 200);
  assert.deepEqual(calls.verifies, [{ secret: "0x-secret", response: "tok-123", remoteip: "198.51.100.9" }]);
  assert.equal(calls.mails.length, 4);
  // One computer asking a 4th time in the hour needs it too, whatever the email.
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: `p${i}@example.com` }, ip: "192.0.2.7" })).status, 200);
  }
  assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: "p3@example.com" }, ip: "192.0.2.7" })).status, 400);
  assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: "p3@example.com", turnstile: "tok-456" }, ip: "192.0.2.7" })).status, 200);
  // A malformed email is refused before Turnstile is asked.
  assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: "nope", turnstile: "tok-789" }, ip: "192.0.2.7" })).status, 400);
  assert.equal(calls.verifies.length, 2);
  assert.equal(calls.mails.length, 8);
});

test("api: a Turnstile token Cloudflare rejects is a 400 and sends no mail; without the secret no token is needed", async (t) => {
  const rejected = fakeEnv({ TURNSTILE_SECRET: "0x-secret" });
  const calls = stubMailAndTurnstile(t, false);
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await call(rejected, "POST", "/api/auth/code", { body: { email: `w${i}@example.com` }, ip: "192.0.2.8" })).status, 200);
  }
  const refused = await call(rejected, "POST", "/api/auth/code", { body: { email: "a@example.com", turnstile: "tok-bad" }, ip: "192.0.2.8" });
  assert.equal((await refused.json()).error, "captcha");
  assert.equal(calls.verifies.length, 1);
  assert.equal(calls.mails.length, 3);
  assert.equal(count(rejected, "login_codes"), 3);

  const open = fakeEnv();
  for (let i = 0; i < 4; i += 1) {
    assert.equal((await call(open, "POST", "/api/auth/code", { body: { email: "a@example.com" }, ip: "192.0.2.9" })).status, 200);
  }
  assert.equal(calls.verifies.length, 1);
  assert.equal(calls.mails.length, 7);
});

test("api: activation codes are 16 Crockford letters in groups of four; typed codes are cleaned up", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const code = randomActivationCode();
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    seen.add(code);
  }
  assert.equal(seen.size, 200);
  assert.equal(normalizeActivationCode(" 7kq2-m9ab x3td_5rwp "), "7KQ2M9ABX3TD5RWP");
  assert.equal(normalizeActivationCode("7KQ2M9ABX3TD5RW"), null);
  assert.equal(normalizeActivationCode("7KQ2M9ABX3TD5RWI"), null);
  assert.equal(normalizeActivationCode(12345), null);
});

// Puts an unused code into the table the way /admin does, and returns the plain code.
function issueCode(env) {
  const code = randomActivationCode();
  const hash = createHash("sha256").update(code.replaceAll("-", "")).digest("hex");
  env.DB.sqlite.prepare("INSERT INTO activation_codes (code_hash, hint, created_at) VALUES (?, ?, ?)").run(hash, code.slice(0, 4), clock);
  return code;
}

test("api: an email outside a company domain is not activated until it redeems a code; sync waits for that", async (t) => {
  const env = libraryEnv({ "domains/company.com": "XS-7KQ2M9AB", "sync/XS-7KQ2M9AB/snippets.json": JSON.stringify(companyLibrary) });
  const sent = stubMail(t);
  await call(env, "POST", "/api/auth/code", { body: { email: "buyer@gmail.com" } });
  const signedIn = await (await call(env, "POST", "/api/auth/verify", { body: { email: "buyer@gmail.com", code: codeFrom(sent.at(-1)) } })).json();
  assert.equal(signedIn.activated, false);
  const { token } = signedIn;
  for (const [method, path] of [["GET", "/api/vault"], ["PUT", "/api/vault"], ["GET", "/api/library"]]) {
    const blocked = await call(env, method, path, { token, body: method === "PUT" ? { baseVersion: 0, data: {} } : undefined });
    assert.equal(blocked.status, 403, path);
    assert.deepEqual(await blocked.json(), { error: "not_activated", message: "这个邮箱还没激活" });
  }

  const wrong = await call(env, "POST", "/api/activate", { token, body: { code: "0000-0000-0000-0000" } });
  assert.equal(wrong.status, 400);
  assert.deepEqual(await wrong.json(), { error: "bad_activation_code", message: "激活码不对或已经用过" });
  assert.equal((await call(env, "POST", "/api/activate", { token, body: { code: "short" } })).status, 400);
  assert.equal((await call(env, "POST", "/api/activate", { token, body: {} })).status, 400);

  const code = issueCode(env);
  const activated = await call(env, "POST", "/api/activate", { token, body: { code: code.toLowerCase() } });
  assert.equal(activated.status, 200);
  assert.deepEqual(await activated.json(), { activated: true });
  const row = env.DB.sqlite.prepare("SELECT email, used_at FROM activation_codes").get();
  assert.equal(row.email, "buyer@gmail.com");
  assert.equal(row.used_at, clock);
  assert.equal((await call(env, "GET", "/api/vault", { token })).status, 200);
  assert.deepEqual((await library(env, token)).body, { domain: null, library: null });
  // The same code again from the same email is fine; from another email it is used up.
  assert.equal((await call(env, "POST", "/api/activate", { token, body: { code } })).status, 200);
  await call(env, "POST", "/api/auth/code", { body: { email: "second@gmail.com" } });
  const second = await (await call(env, "POST", "/api/auth/verify", { body: { email: "second@gmail.com", code: codeFrom(sent.at(-1)) } })).json();
  assert.equal((await call(env, "POST", "/api/activate", { token: second.token, body: { code } })).status, 400);
  // A later sign-in of the activated email says so.
  await call(env, "POST", "/api/auth/code", { body: { email: "buyer@gmail.com" } });
  const again = await (await call(env, "POST", "/api/auth/verify", { body: { email: "buyer@gmail.com", code: codeFrom(sent.at(-1)) } })).json();
  assert.equal(again.activated, true);
});

test("api: a company-domain email is activated by its domain; logout and account deletion never need activation", async (t) => {
  const env = libraryEnv({ "domains/company.com": "XS-7KQ2M9AB" });
  const sent = stubMail(t);
  await call(env, "POST", "/api/auth/code", { body: { email: "staff@company.com" } });
  const staff = await (await call(env, "POST", "/api/auth/verify", { body: { email: "staff@company.com", code: codeFrom(sent.at(-1)) } })).json();
  assert.equal(staff.activated, true);
  assert.equal((await call(env, "GET", "/api/vault", { token: staff.token })).status, 200);
  assert.equal((await call(env, "POST", "/api/activate", { token: staff.token, body: { code: "x" } })).status, 200);

  await call(env, "POST", "/api/auth/code", { body: { email: "buyer@gmail.com" } });
  const buyer = await (await call(env, "POST", "/api/auth/verify", { body: { email: "buyer@gmail.com", code: codeFrom(sent.at(-1)) } })).json();
  assert.equal((await call(env, "POST", "/api/auth/logout", { token: buyer.token })).status, 200);
  await call(env, "POST", "/api/auth/code", { body: { email: "buyer@gmail.com" } });
  const back = await (await call(env, "POST", "/api/auth/verify", { body: { email: "buyer@gmail.com", code: codeFrom(sent.at(-1)) } })).json();
  assert.equal((await call(env, "DELETE", "/api/account", { token: back.token })).status, 200);
  assert.equal((await call(env, "POST", "/api/activate", { body: { code: "x" } })).status, 401);
});

test("api: at most 10 activation tries per IP each hour", async (t) => {
  const env = fakeEnv();
  const sent = stubMail(t);
  const token = await signIn(env, sent, "buyer@gmail.com", { activated: false });
  for (let i = 0; i < 10; i += 1) assert.equal((await call(env, "POST", "/api/activate", { token, body: { code: "0000-0000-0000-0000" } })).status, 400);
  const limited = await call(env, "POST", "/api/activate", { token, body: { code: issueCode(env) } });
  assert.equal(limited.status, 429);
  assert.equal((await call(env, "POST", "/api/activate", { token, body: { code: issueCode(env) }, now: clock + 61 * 60 * 1000 })).status, 200);
});
