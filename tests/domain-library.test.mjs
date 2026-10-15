import assert from "node:assert/strict";
import test from "node:test";
import { CloudError, createCloudApi } from "../app/cloud-client.ts";
import { LOCAL_ONLY_KEYS } from "../app/data-transfer.ts";
import { DOMAIN_LIBRARY_KEY, domainLibraryActive, domainLibraryLine, emailAtDomain, readDomainLibrary, settleDomainMark, shouldApplyPreset, shouldFetchDomainLibrary, syncChangedSomething, takeDomainAnswer, writeDomainLibrary } from "../app/domain-library.ts";
import { parseSharedLibrary } from "../app/shared-library.ts";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    map,
  };
}

const answering = (status, body) => {
  const calls = [];
  const api = createCloudApi(async (request) => { calls.push(request); return { status, text: JSON.stringify(body) }; });
  return { api, calls };
};

test("getLibrary asks GET /api/library with the sign-in token and hands back the library as text", async () => {
  const library = { format: "clipbox-shared-library", version: 1, items: [{ id: "A", folder: "询盘接待", label: "欢迎", secret: "您好" }] };
  const { api, calls } = answering(200, { domain: "company.com", library });
  const result = await api.getLibrary("tok");
  assert.deepEqual(calls, [{ method: "GET", path: "/api/library", token: "tok" }]);
  assert.equal(result.domain, "company.com");
  assert.deepEqual(JSON.parse(result.text), library);
  assert.equal(parseSharedLibrary(result.text).items[0].id, "A");
});

test("getLibrary: no binding, odd answers and a missing domain all mean nothing to apply", async () => {
  assert.deepEqual(await answering(200, { domain: null, library: null }).api.getLibrary("t"), { domain: null, text: null });
  assert.deepEqual(await answering(200, {}).api.getLibrary("t"), { domain: null, text: null });
  assert.deepEqual(await answering(200, { domain: "", library: { items: [] } }).api.getLibrary("t"), { domain: null, text: '{"items":[]}' });
  const list = [{ id: "A", folder: "询盘接待", label: "欢迎", secret: "您好" }];
  const bare = await answering(200, { domain: "a.com", library: list }).api.getLibrary("t");
  assert.deepEqual(bare, { domain: "a.com", text: JSON.stringify(list) }, "a bare list of entries is a library too");
  assert.equal(parseSharedLibrary(bare.text).items[0].id, "A");
  assert.deepEqual(await answering(200, { domain: "a.com", library: "text" }).api.getLibrary("t"), { domain: "a.com", text: null });
  assert.deepEqual(await answering(200, { domain: 5, library: null }).api.getLibrary("t"), { domain: null, text: null });
});

test("getLibrary: a storage failure on the server is an error, not \"no library\"", async () => {
  await assert.rejects(answering(500, { error: "storage_error" }).api.getLibrary("t"), (error) => error instanceof CloudError && error.code === "server");
});

test("getLibrary: a 401 maps to signed out like the other signed-in requests", async () => {
  await assert.rejects(answering(401, { error: "unauthorized" }).api.getLibrary("t"), (error) => error instanceof CloudError && error.code === "signed_out");
  await assert.rejects(answering(401, { error: "device_limit" }).api.getLibrary("t"), (error) => error instanceof CloudError && error.code === "replaced");
});

test("a typed 同步码 always wins; signed out asks nothing", () => {
  assert.equal(shouldFetchDomainLibrary({ syncCode: "ABCD-1234", email: "a@company.com" }), false);
  assert.equal(shouldFetchDomainLibrary({ syncCode: "", email: "" }), false);
  assert.equal(shouldFetchDomainLibrary({ syncCode: "  ", email: "a@company.com" }), true);
});

test("the server's answer sets or clears the marker on this computer", () => {
  const storage = memoryStorage();
  assert.deepEqual(takeDomainAnswer({ domain: "company.com", text: "{}" }, 100, storage), { domain: "company.com", text: "{}" });
  assert.deepEqual(readDomainLibrary(storage), { domain: "company.com", at: 100 });
  assert.equal(takeDomainAnswer({ domain: null, text: null }, 200, storage), null);
  assert.equal(readDomainLibrary(storage), null);
  assert.equal(storage.map.has(DOMAIN_LIBRARY_KEY), false);
  writeDomainLibrary({ domain: "company.com", at: 1 }, storage);
  assert.equal(takeDomainAnswer({ domain: "company.com", text: null }, 2, storage), null, "a domain without a library is no library");
  assert.equal(readDomainLibrary(storage), null);
});

test("the preset is skipped while a domain library comes in, and when a 同步码 is typed", () => {
  const mark = { domain: "company.com", at: 1 };
  assert.equal(shouldApplyPreset({ preset: "{...}", syncCode: "", mark: null }), true);
  assert.equal(shouldApplyPreset({ preset: "{...}", syncCode: "", mark }), false);
  assert.equal(shouldApplyPreset({ preset: "{...}", syncCode: "CODE", mark: null }), false);
  assert.equal(shouldApplyPreset({ preset: "", syncCode: "", mark: null }), false);
});

test("signing out or signing in at another domain clears the marker", () => {
  const storage = memoryStorage();
  writeDomainLibrary({ domain: "company.com", at: 1 }, storage);
  assert.deepEqual(settleDomainMark("me@company.com", storage), { domain: "company.com", at: 1 });
  assert.deepEqual(settleDomainMark("Me@Sales.Company.com", storage), { domain: "company.com", at: 1 });
  assert.equal(settleDomainMark("me@gmail.com", storage), null);
  assert.equal(readDomainLibrary(storage), null);
  writeDomainLibrary({ domain: "company.com", at: 1 }, storage);
  assert.equal(settleDomainMark("", storage), null);
  assert.equal(readDomainLibrary(storage), null);
  storage.setItem(DOMAIN_LIBRARY_KEY, "not json");
  assert.equal(readDomainLibrary(storage), null);
});

test("Settings names the domain only while it applies", () => {
  assert.equal(domainLibraryActive("company.com", "a@company.com", ""), "company.com");
  assert.equal(domainLibraryActive("company.com", "a@company.com", "CODE"), "");
  assert.equal(domainLibraryActive("company.com", "", ""), "");
  assert.equal(domainLibraryActive("company.com", "a@other.com", ""), "");
  assert.equal(domainLibraryActive("", "a@company.com", ""), "");
  assert.equal(emailAtDomain("a@notcompany.com", "company.com"), false);
  assert.equal(domainLibraryLine("company.com"), "公司话术：按邮箱自动获取（company.com）");
});

test("quiet unless something changed; the marker never goes into a 完整备份", () => {
  const none = { at: 1, total: 3, added: 0, updated: 0, keptMine: 0, retired: 0, restored: 0, skipped: 0 };
  assert.equal(syncChangedSomething(none), false);
  assert.equal(syncChangedSomething({ ...none, added: 1 }), true);
  assert.equal(syncChangedSomething({ ...none, retired: 1 }), true);
  assert.equal(LOCAL_ONLY_KEYS.has(DOMAIN_LIBRARY_KEY), true);
});

test("the pretend server binds example.com only", async () => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  try {
    const { demoCloudRequest, DEMO_CODE } = await import("../app/cloud-demo.ts");
    const api = createCloudApi(demoCloudRequest);
    const signIn = async (email) => { await api.sendCode(email); return (await api.verify(email, DEMO_CODE, "电脑")).token; };
    const bound = await api.getLibrary(await signIn("someone@example.com"));
    assert.equal(bound.domain, "example.com");
    const parsed = parseSharedLibrary(bound.text);
    assert.deepEqual(parsed.items.map((item) => item.id), ["DEMO-DOMAIN-1", "DEMO-DOMAIN-2", "DEMO-DOMAIN-3"]);
    assert.deepEqual(parsed.items.map((item) => item.folder), ["询盘接待", "报价成交", "物流清关"]);
    assert.deepEqual(await api.getLibrary(await signIn("someone@gmail.com")), { domain: null, text: null });
    await assert.rejects(api.getLibrary("demo-unknown"), (error) => error.code === "signed_out");
  } finally {
    delete globalThis.localStorage;
  }
});
