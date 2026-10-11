import assert from "node:assert/strict";
import test from "node:test";
import { mergeVaultBox } from "../app/vault-backup.ts";
import { openSecretItemsStore } from "../app/secret-items-store.ts";
import { openTotpStore } from "../app/totp-store.ts";

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }; };
const login = { id: "l1", type: "login", name: "A", url: "", username: "u", password: "p", note: "", createdAt: 1, updatedAt: 1 };
const account = { id: "t1", issuer: "G", name: "n", secret: "JBSWY3DPEHPK3PXP", digits: 6, period: 30, algorithm: "SHA1", createdAt: 1 };

test("收藏, 回收站 and last-copied marks are kept by both stores and change nothing else", async () => {
  const storage = memory();
  const items = openSecretItemsStore("k", storage);
  await items.put(login);
  await items.put({ ...login, pinned: true, lastUsedAt: 5, trashedAt: 9 });
  assert.deepEqual((await items.list())[0], { ...login, pinned: true, lastUsedAt: 5, trashedAt: 9 });
  await items.put({ ...login, pinned: true, lastUsedAt: 5, trashedAt: undefined });
  assert.equal("trashedAt" in (await items.list())[0], false);
  const totp = openTotpStore("k", storage);
  await totp.add(account);
  await totp.put({ ...account, trashedAt: 7 });
  const list = await totp.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].trashedAt, 7);
  assert.equal(list[0].secret, account.secret);
});

test("entries from an older backup (no marks) merge with marked ones without losing the marks", () => {
  const marked = { ...login, trashedAt: 3 };
  const merged = mergeVaultBox({ totp: [], items: [marked] }, { totp: [], items: [login] }, "merge");
  assert.equal(merged.items.length, 1);
  assert.equal(merged.items[0].trashedAt, 3);
});
