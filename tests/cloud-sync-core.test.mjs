import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint, mergeAccounts, mergeSnippets, readCloudDoc, syncPolicy, threeWayMerge, tooManyRemovals, withSecretsFrom, withoutSecrets } from "../app/cloud-sync-core.ts";
import { createCloudApi, readLastEmail, writeLastEmail } from "../app/cloud-client.ts";
import { syncOnce } from "../app/cloud-sync.ts";

const snippet = (id, text, extra = {}) => ({ id, label: id, secret: text, note: "", color: "", kind: "snippet", createdAt: 1, updatedAt: 1, ...extra });
const side = (items, folders = [], sharedSeen = []) => ({ items, folders, sharedSeen });
const login = (id, password, extra = {}) => ({ id, type: "login", name: id, url: "", username: "me", password, note: "", createdAt: 1, updatedAt: 1, ...extra });
const opts = { key: (item) => item.id, hash: (item) => fingerprint(item), stamp: (item) => item.updatedAt };
const baseOf = (items) => Object.fromEntries(items.map((item) => [item.id, fingerprint(item)]));
const mac = syncPolicy("darwin");
const win = syncPolicy("win32");

test("first sync keeps everything from both computers", () => {
  const result = mergeSnippets(side([snippet("a", "A")]), side([snippet("b", "B")]), {});
  assert.deepEqual(result.items.map((item) => item.id), ["a", "b"]);
  assert.deepEqual(result.cloud.items.map((item) => item.id), ["a", "b"]);
  assert.deepEqual(result.counts, { added: 1, updated: 0, removed: 0 });
  assert.equal(result.changed, true);
});

test("a change on one side wins; a change on both keeps the later edit", () => {
  const a = snippet("a", "old");
  const base = baseOf([a]);
  const remoteEdit = threeWayMerge([a], [{ ...a, secret: "theirs", updatedAt: 2 }], base, opts);
  assert.equal(remoteEdit.picked[0].item.secret, "theirs");
  const localEdit = threeWayMerge([{ ...a, secret: "mine", updatedAt: 2 }], [a], base, opts);
  assert.equal(localEdit.picked[0].item.secret, "mine");
  // Even an older timestamp wins when only that side changed.
  const olderLocal = threeWayMerge([{ ...a, secret: "mine", updatedAt: 0 }], [a], base, opts);
  assert.equal(olderLocal.picked[0].item.secret, "mine");
  const both = threeWayMerge([{ ...a, secret: "mine", updatedAt: 5 }], [{ ...a, secret: "theirs", updatedAt: 6 }], base, opts);
  assert.equal(both.picked[0].item.secret, "theirs");
  const tie = threeWayMerge([{ ...a, secret: "mine", updatedAt: 6 }], [{ ...a, secret: "theirs", updatedAt: 6 }], base, opts);
  assert.equal(tie.picked[0].item.secret, "mine");
});

test("deleting on one computer deletes on the other, unless it was edited there since", () => {
  const a = snippet("a", "A");
  const base = baseOf([a]);
  assert.equal(threeWayMerge([a], [], base, opts).picked.length, 0);
  assert.equal(threeWayMerge([], [a], base, opts).picked.length, 0);
  const editedHere = threeWayMerge([{ ...a, secret: "edited" }], [], base, opts);
  assert.equal(editedHere.picked[0].item.secret, "edited");
  const editedThere = threeWayMerge([], [{ ...a, secret: "edited" }], base, opts);
  assert.equal(editedThere.picked[0].item.secret, "edited");
});

test("pins and the 回收站 sync even though they do not change updatedAt; copy counts and numbers do not count as edits", () => {
  const a = snippet("a", "A", { snippetNumber: "#001", useCount: 1 });
  const merged = mergeSnippets(side([a]), side([a]), {});
  const base = merged.base;
  const pinnedThere = mergeSnippets(side([a]), side([{ ...a, pinned: true }]), base);
  assert.equal(pinnedThere.items[0].pinned, true);
  const trashedThere = mergeSnippets(side([a]), side([{ ...a, deletedAt: 9 }]), base);
  assert.equal(trashedThere.items[0].deletedAt, 9);
  // Their number and copy count stay theirs; ours stay ours.
  const counted = mergeSnippets(side([{ ...a, useCount: 7 }]), side([{ ...a, snippetNumber: "#044", useCount: 2, pinned: true }]), base);
  assert.equal(counted.items[0].pinned, true);
  assert.equal(counted.items[0].snippetNumber, "#001");
  assert.equal(counted.items[0].useCount, 7);
  const onlyCounts = mergeSnippets(side([{ ...a, useCount: 9 }]), side([{ ...a, snippetNumber: "#002" }]), base);
  assert.equal(onlyCounts.counts.updated, 0);
});

test("company 话术 match by their company id, so two computers do not end up with two copies", () => {
  const mine = snippet("local-1", "公司", { shared: { id: "c1", baseHash: "h" } });
  const theirs = snippet("remote-9", "公司", { shared: { id: "c1", baseHash: "h" } });
  const result = mergeSnippets(side([mine], [], ["c1"]), side([theirs], [], ["c1", "c2"]), {});
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.sharedSeen, ["c1", "c2"]);
});

test("other kinds in the vault pass through, and folders are joined", () => {
  const secret = { ...snippet("s", "x"), kind: "secret" };
  const result = mergeSnippets(side([secret, snippet("a", "A", { folder: "我的" })], ["我的"]), side([snippet("b", "B", { folder: "新目录" })], ["远程"]), {});
  assert.equal(result.items[0].id, "s");
  assert.ok(!result.cloud.items.some((item) => item.id === "s"));
  assert.deepEqual(result.folders, ["我的", "远程", "新目录"]);
});

test("a Mac never uploads its passwords and never stores the cloud's", () => {
  const here = [login("l1", "mac-secret"), { id: "r1", type: "recovery", name: "G", site: "", codes: ["1111"], note: "", createdAt: 1, updatedAt: 1 }];
  const cloud = [login("l1", "win-secret", { username: "new", updatedAt: 5 }), login("l2", "win-only")];
  const result = mergeAccounts(here, cloud, {}, mac);
  const byId = Object.fromEntries(result.items.map((item) => [item.id, item]));
  assert.equal(byId.l1.username, "new");
  assert.equal(byId.l1.password, "mac-secret");
  assert.equal(byId.l2.password, "");
  assert.deepEqual(byId.r1.codes, ["1111"]);
  const up = Object.fromEntries(result.cloud.map((item) => [item.id, item]));
  // What goes up keeps the cloud's own passwords and adds none of the Mac's.
  assert.equal(up.l1.password, "win-secret");
  assert.equal(up.l2.password, "win-only");
  assert.deepEqual(up.r1.codes, []);
  // A password change on the Mac alone is not a change to sync.
  const again = mergeAccounts(result.items.map((item) => item.id === "l1" ? { ...item, password: "changed" } : item), result.cloud, result.base, mac);
  assert.equal(again.counts.updated + again.counts.added + again.counts.removed, 0);
});

test("Windows syncs passwords, and leaves the Mac's API entries in the cloud without storing them", () => {
  const api = { id: "k1", type: "apikey", name: "OpenAI", service: "", key: "", secret: "", endpoint: "", expires: "", createdAt: 1, updatedAt: 1 };
  const result = mergeAccounts([login("l1", "pw", { updatedAt: 3 })], [login("l1", "old"), api], {}, win);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].password, "pw");
  assert.deepEqual(result.cloud.map((item) => item.id).sort(), ["k1", "l1"]);
  assert.equal(result.cloud.find((item) => item.id === "l1").password, "pw");
});

test("secret parts of API entries and converted notes stay on the Mac", () => {
  const note = { id: "n", type: "note", name: "n", body: "pw: 123", createdAt: 1, updatedAt: 1 };
  const api = { id: "k", type: "apikey", name: "A", service: "", key: "k1", secret: "s1", fields: [{ id: "f", label: "Key", value: "k1" }], note: "公开", fromNote: note, endpoint: "", expires: "", createdAt: 1, updatedAt: 1 };
  const bare = withoutSecrets(api);
  assert.equal(bare.key, "");
  assert.equal(bare.fields[0].value, "");
  assert.equal(bare.fields[0].label, "Key");
  assert.equal(bare.note, "公开");
  assert.equal(bare.fromNote, undefined);
  assert.deepEqual(withSecretsFrom({ ...bare, name: "B" }, api), { ...api, name: "B" });
  assert.equal(withoutSecrets(login("x", "pw", { fromNote: note })).fromNote, undefined);
});

test("an unreadable or emptied cloud copy never deletes everything here", () => {
  assert.equal(readCloudDoc(null), null);
  assert.throws(() => readCloudDoc({ format: 99 }), /更新版本/);
  const doc = readCloudDoc({ format: 1, snippets: [snippet("a", "A"), { nope: 1 }, null], accounts: "x" });
  assert.deepEqual(doc.snippets.map((item) => item.id), ["a"]);
  assert.deepEqual(doc.accounts, []);
  assert.equal(tooManyRemovals({ added: 0, updated: 0, removed: 30 }, 40), true);
  assert.equal(tooManyRemovals({ added: 0, updated: 0, removed: 30 }, 100), false);
  assert.equal(tooManyRemovals({ added: 0, updated: 0, removed: 5 }, 5), false);
});

// A pretend server with the real rules (version numbers), and two computers sharing it.
function fakeServer() {
  const state = { version: 0, data: null, puts: 0, cutIn: null, reports: [] };
  const transport = async ({ method, path, body }) => {
    if (path === "/api/vault/too-large" && method === "POST") { state.reports.push(body.bytes); return { status: 200, text: "{}" }; }
    if (path === "/api/vault" && method === "GET") return { status: 200, text: JSON.stringify({ version: state.version, data: state.data }) };
    if (path === "/api/vault" && method === "PUT") {
      if (state.cutIn) { const cut = state.cutIn; state.cutIn = null; cut(); }
      if (body.baseVersion !== state.version) return { status: 409, text: JSON.stringify({ error: "version_conflict", version: state.version }) };
      state.version += 1; state.data = body.data; state.puts += 1;
      return { status: 200, text: JSON.stringify({ version: state.version }) };
    }
    return { status: 404, text: "{}" };
  };
  return { state, api: createCloudApi(transport) };
}

function computer(items, accounts = null) {
  const here = { items, folders: [], sharedSeen: [], accounts, locked: false, base: { snippets: {}, accounts: {} } };
  return {
    here,
    async sync(api) {
      const result = await syncOnce({
        api, token: "t", base: here.base,
        accounts: here.accounts && !here.locked ? async (remote, base) => {
          const merged = mergeAccounts(here.accounts, remote, base, win);
          here.accounts = merged.items;
          return merged;
        } : null,
        snippets: async (remote, base) => {
          const merged = mergeSnippets(side(here.items, here.folders, here.sharedSeen), remote, base);
          here.items = merged.items; here.folders = merged.folders; here.sharedSeen = merged.sharedSeen;
          return merged;
        },
      });
      here.base = result.base;
      return result;
    },
  };
}

test("two computers end up with the same 话术, and a sync with nothing new uploads nothing", async () => {
  const { state, api } = fakeServer();
  const pc1 = computer([snippet("a", "A")]);
  const pc2 = computer([snippet("b", "B")]);
  await pc1.sync(api);
  await pc2.sync(api);
  await pc1.sync(api);
  assert.deepEqual(pc1.here.items.map((item) => item.id).sort(), ["a", "b"]);
  assert.deepEqual(pc2.here.items.map((item) => item.id).sort(), ["a", "b"]);
  const puts = state.puts;
  await pc1.sync(api);
  assert.equal(state.puts, puts);
  // Delete on one, gone on the other.
  pc2.here.items = pc2.here.items.filter((item) => item.id !== "a");
  await pc2.sync(api);
  await pc1.sync(api);
  assert.deepEqual(pc1.here.items.map((item) => item.id), ["b"]);
});

test("a lost or emptied cloud copy is a first sync again: nothing here is deleted, the cloud is refilled (D-093)", async () => {
  const { state, api } = fakeServer();
  const many = Array.from({ length: 15 }, (_, n) => snippet(`s${n}`, `S${n}`));
  const pc1 = computer(many);
  await pc1.sync(api);
  // The server's row is gone (restored, wiped): it answers "no copy" even though pc1's base remembers every entry.
  state.data = null; state.version = 0;
  const lost = await pc1.sync(api);
  assert.equal(pc1.here.items.length, 15);
  assert.deepEqual(lost.counts, { added: 0, updated: 0, removed: 0 });
  assert.equal(state.data.snippets.length, 15);
  // A fresh computer syncs first after the loss and uploads an empty copy; pc1 still keeps everything.
  state.data = null; state.version = 0;
  const pc2 = computer([]);
  await pc2.sync(api);
  assert.deepEqual(state.data.snippets, []);
  await pc1.sync(api);
  assert.equal(pc1.here.items.length, 15);
  await pc2.sync(api);
  assert.equal(pc2.here.items.length, 15);
});

test("a lost cloud copy refilled by a computer with its 账号 page locked does not delete 账号 elsewhere (D-093)", async () => {
  const { state, api } = fakeServer();
  const logins = Array.from({ length: 15 }, (_, n) => login(`l${n}`, `pw${n}`));
  const pc1 = computer([snippet("a", "A")], logins);
  const pc2 = computer([], []);
  await pc1.sync(api);
  await pc2.sync(api);
  assert.equal(pc2.here.accounts.length, 15);
  // The row is lost; pc2 syncs first with its 账号 page locked, so the new cloud copy has 话术 but no 账号.
  state.data = null; state.version = 0;
  pc2.here.locked = true;
  await pc2.sync(api);
  assert.deepEqual(state.data.accounts, []);
  const result = await pc1.sync(api);
  assert.equal(result.counts.removed, 0);
  assert.equal(pc1.here.accounts.length, 15);
  assert.equal(state.data.accounts.length, 15);
  // Unlocked again, pc2 still remembers its old 账号 base, so a later deletion on pc1 still reaches it.
  pc2.here.locked = false;
  await pc2.sync(api);
  assert.equal(pc2.here.accounts.length, 15);
  pc1.here.accounts = pc1.here.accounts.filter((item) => item.id !== "l0");
  await pc1.sync(api);
  await pc2.sync(api);
  assert.equal(pc2.here.accounts.length, 14);
});

test("when another computer uploads in between, the second round keeps both computers' edits", async () => {
  const { state, api } = fakeServer();
  const pc1 = computer([snippet("a", "A"), snippet("b", "B")]);
  const pc2 = computer([]);
  await pc1.sync(api);
  await pc2.sync(api);
  pc1.here.items = pc1.here.items.map((item) => item.id === "a" ? { ...item, secret: "A1", updatedAt: 2 } : item);
  pc2.here.items = pc2.here.items.map((item) => item.id === "b" ? { ...item, secret: "B2", updatedAt: 2 } : item);
  state.cutIn = () => { void pc2.sync(api); };
  // pc2's upload lands while pc1 is uploading; let it finish first.
  const first = pc1.sync(api);
  await first;
  await pc2.sync(api);
  await pc1.sync(api);
  const text = (pc) => Object.fromEntries(pc.here.items.map((item) => [item.id, item.secret]));
  assert.deepEqual(text(pc1), { a: "A1", b: "B2" });
  assert.deepEqual(text(pc2), { a: "A1", b: "B2" });
});

test("the server's answers turn into plain messages: too big, not available yet, wrong code, signed out", async () => {
  const answers = {
    "PUT /api/vault": { status: 413, text: JSON.stringify({ error: "too_large", message: "内容太大，无法同步" }) },
    "POST /api/auth/code": { status: 503, text: JSON.stringify({ error: "unavailable", message: "同步服务暂时不能用，请稍后再试" }) },
    "POST /api/auth/verify": { status: 401, text: JSON.stringify({ error: "bad_code", message: "验证码不对或已过期，请重新获取" }) },
    "GET /api/vault": { status: 401, text: JSON.stringify({ error: "unauthorized", message: "请重新登录" }) },
  };
  const api = createCloudApi(async ({ method, path }) => answers[`${method} ${path}`]);
  await assert.rejects(api.putVault("t", 0, {}), { code: "too_large", message: /超过了云端 1.9 MB 的上限.*请联系管理者/ });
  await assert.rejects(api.sendCode("a@example.com"), { code: "unavailable", message: "登录同步暂时不能用，请稍后再试" });
  await assert.rejects(api.verify("a@example.com", "000000", "电脑"), { code: "bad_code" });
  await assert.rejects(api.getVault("t"), { code: "signed_out" });
});

test("when the shell cannot reach the server, the message carries the shell's reason (cloud.rs)", async () => {
  const failing = createCloudApi(async () => { throw new Error("network: error sending request: dns error: no such host"); });
  await assert.rejects(failing.sendCode("a@example.com"), { code: "network", message: "连不上服务器，请检查网络后再试（error sending request: dns error: no such host）" });
  const bare = createCloudApi(async () => { throw new Error("network"); });
  await assert.rejects(bare.sendCode("a@example.com"), { code: "network", message: "连不上服务器，请检查网络后再试" });
});

test("at most 3 computers: a new sign-in hears which ones signed out, an ended one hears why (D-069)", async () => {
  const answers = {
    "POST /api/auth/verify": { status: 200, text: JSON.stringify({ token: "new", email: "a@example.com", signedOut: ["Windows 电脑", 7] }) },
    "GET /api/vault": { status: 401, text: JSON.stringify({ error: "device_limit", message: "…" }) },
  };
  const api = createCloudApi(async ({ method, path }) => answers[`${method} ${path}`]);
  assert.deepEqual(await api.verify("a@example.com", "123456", "Mac 电脑"), { token: "new", email: "a@example.com", signedOut: ["Windows 电脑"], activated: true });
  await assert.rejects(api.getVault("old"), { code: "replaced", message: /最多同时登录 3 台电脑，这台电脑已退出登录/ });
  answers["POST /api/auth/verify"].text = JSON.stringify({ token: "t", email: "a@example.com" });
  assert.deepEqual((await api.verify("a@example.com", "123456", "Mac 电脑")).signedOut, [], "an older server sends no list");
});

test("a cloud copy over 1.9 MB is not sent at all, and nothing here changes", async () => {
  const { state, api } = fakeServer();
  const big = "字".repeat(700_000);
  const pc = computer([snippet("a", big)]);
  await assert.rejects(pc.sync(api), { code: "too_large", message: /请联系管理者/ });
  assert.equal(state.puts, 0);
  assert.equal(state.reports.length, 1, "the size is reported so the manager hears about it (D-097)");
  assert.ok(state.reports[0] > 1_900_000);
  assert.equal(pc.here.items[0].secret, big);
});

test("login page (D-085): the 人机验证 token goes with the code request, verify says whether the email is activated, activate posts the code", async () => {
  const calls = [];
  const answers = {
    "POST /api/auth/code": { status: 200, text: "{}" },
    "POST /api/auth/verify": { status: 200, text: JSON.stringify({ token: "t", email: "me@gmail.com", activated: false }) },
    "POST /api/activate": { status: 200, text: JSON.stringify({ activated: true }) },
  };
  const api = createCloudApi(async (request) => { calls.push(request); return answers[`${request.method} ${request.path}`]; });
  await api.sendCode("Me@Gmail.com", "tok");
  await api.sendCode("me@gmail.com");
  assert.deepEqual(calls.map((call) => call.body), [{ email: "me@gmail.com", turnstile: "tok" }, { email: "me@gmail.com" }]);
  assert.equal((await api.verify("me@gmail.com", "123456", "电脑")).activated, false);
  await api.activate("t", " aaaa-bbbb ");
  assert.deepEqual(calls.at(-1), { method: "POST", path: "/api/activate", token: "t", body: { code: "aaaa-bbbb" } });
  // An older server never mentions activation: the sign-in counts as activated.
  answers["POST /api/auth/verify"] = { status: 200, text: JSON.stringify({ token: "t", email: "me@gmail.com" }) };
  assert.equal((await api.verify("me@gmail.com", "123456", "电脑")).activated, true);
});

test("login page (D-085): the server's refusals turn into plain messages: 人机验证 missing, bad activation code, not activated yet", async () => {
  const answers = {
    "POST /api/auth/code": { status: 400, text: JSON.stringify({ error: "captcha", message: "请先完成人机验证" }) },
    "POST /api/activate": { status: 400, text: JSON.stringify({ error: "bad_activation_code", message: "激活码不对或已经用过" }) },
    "GET /api/vault": { status: 403, text: JSON.stringify({ error: "not_activated", message: "这个邮箱还没激活" }) },
  };
  const api = createCloudApi(async ({ method, path }) => answers[`${method} ${path}`]);
  await assert.rejects(api.sendCode("a@example.com", "x"), { code: "captcha", message: "请先完成人机验证" });
  await assert.rejects(api.activate("t", "0000"), { code: "bad_activation", message: "激活码不对或已经用过" });
  await assert.rejects(api.getVault("t"), { code: "not_activated", message: /还没激活/ });
});

test("the login page remembers the email last signed in here (D-099)", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  assert.equal(readLastEmail(storage), "");
  writeLastEmail("me@example.com", storage);
  assert.equal(readLastEmail(storage), "me@example.com");
  writeLastEmail("", storage);
  assert.equal(readLastEmail(storage), "");
});
