import assert from "node:assert/strict";
import test from "node:test";
import { decryptVaultBox, encryptVaultBox, isSaneIterationCount, isVaultBoxEmpty, looksLikeVaultBox, mergeVaultBox } from "../app/vault-backup.ts";

const acc = (id, name = id) => ({ id, issuer: "Example", name, secret: "JBSWY3DPEHPK3PXP", digits: 6, period: 30, algorithm: "SHA1", createdAt: 1 });
const item = (id) => ({ id, type: "login", name: id });

test("the vault block round-trips with the right password and stays unreadable without it", async () => {
  const payload = { totp: [acc("a")], items: [item("i1")] };
  const box = await encryptVaultBox(payload, "pw-123");
  assert.ok(looksLikeVaultBox(box));
  assert.ok(!JSON.stringify(box).includes("JBSWY3DPEHPK3PXP"));
  assert.deepEqual(await decryptVaultBox(box, "pw-123"), payload);
  await assert.rejects(decryptVaultBox(box, "wrong"));
});

test("a damaged or missing block is not accepted", () => {
  assert.equal(looksLikeVaultBox(undefined), false);
  assert.equal(looksLikeVaultBox({ version: 1 }), false);
  assert.equal(isVaultBoxEmpty({ totp: [], items: [] }), true);
});

test("merge keeps what is here and adds only what is missing; replace equals the backup", () => {
  const current = { totp: [acc("a")], items: [item("i1")] };
  const incoming = { totp: [acc("b", "a"), acc("c")], items: [item("i1"), item("i2")] };
  const merged = mergeVaultBox(current, incoming, "merge");
  assert.deepEqual(merged.totp.map((x) => x.id), ["a", "c"]);
  assert.deepEqual(merged.items.map((x) => x.id), ["i1", "i2"]);
  assert.deepEqual(mergeVaultBox(current, incoming, "replace"), incoming);
});

test("a block asking for an absurd key-stretching count is refused before any work is done", async () => {
  const box = await encryptVaultBox({ totp: [], items: [] }, "pw-123");
  for (const iterations of [0, 1, 99_999, 5_000_001, 1e12, 310_000.5, Number.NaN, Infinity]) {
    await assert.rejects(decryptVaultBox({ ...box, iterations }, "pw-123"), /这不是有效的 Clipboxx 加密备份/, String(iterations));
  }
  assert.equal(isSaneIterationCount(100_000), true);
  assert.equal(isSaneIterationCount(5_000_000), true);
  assert.equal(isSaneIterationCount("310000"), false);
  assert.deepEqual(await decryptVaultBox({ ...box, iterations: 310_000 }, "pw-123"), { totp: [], items: [] });
});
