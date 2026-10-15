import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { deviceName, handleApi, normalizeEmail, randomCode } from "../tools/website/api.mjs";
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

async function signIn(env, sent, email = "Staff@Example.com ") {
  const asked = await call(env, "POST", "/api/auth/code", { body: { email } });
  assert.equal(asked.status, 200);
  const code = codeFrom(sent.at(-1));
  const verified = await call(env, "POST", "/api/auth/verify", { body: { email, code, device: "Windows 电脑" } });
  assert.equal(verified.status, 200);
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
  assert.equal(env.DB.sqlite.prepare("SELECT email FROM users").get().email, "staff@example.com");

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
  assert.equal(count(env, "users"), 1);
  const bad = await call(env, "POST", "/api/auth/code", { body: { email: "not an email" } });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, "bad_email");
  assert.equal((await call(env, "POST", "/api/auth/code", { raw: "{oops" })).status, 400);
});

test("api: at most 5 codes per email and 20 requests per IP each hour", async (t) => {
  const env = fakeEnv();
  const sent = stubMail(t);
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: "a@example.com" }, ip: `198.51.100.${i}` })).status, 200);
  }
  const limited = await call(env, "POST", "/api/auth/code", { body: { email: "a@example.com" }, ip: "198.51.100.99" });
  assert.equal(limited.status, 429);
  const limitedBody = await limited.json();
  assert.equal(limitedBody.error, "rate_limited");
  assert.match(limitedBody.message, /频繁/);
  assert.equal(sent.length, 5);
  const nextHour = await call(env, "POST", "/api/auth/code", { body: { email: "a@example.com" }, now: clock + 60 * 60 * 1000 + 1 });
  assert.equal(nextHour.status, 200, "the limit resets after an hour");

  for (let i = 0; i < 20; i += 1) {
    assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: `p${i}@example.com` }, ip: "192.0.2.7" })).status, 200);
  }
  assert.equal((await call(env, "POST", "/api/auth/code", { body: { email: "p99@example.com" }, ip: "192.0.2.7" })).status, 429);
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
