import assert from "node:assert/strict";
import test from "node:test";
import { base32Decode, formatCode, generateTotp, parseTotpInput, secondsLeft } from "../app/totp-core.ts";
import { openTotpStore, TOTP_STORAGE_KEY } from "../app/totp-store.ts";

// RFC 6238 appendix B: the secrets are the ASCII strings "12345678901234567890" (SHA1), ...32 (SHA256), ...64 (SHA512).
const b32 = (text) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const byte of Buffer.from(text)) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) out += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  return out;
};
const seed1 = b32("12345678901234567890");
const seed256 = b32("12345678901234567890123456789012");
const seed512 = b32("1234567890123456789012345678901234567890123456789012345678901234");

test("RFC 6238 test vectors (8 digits)", async () => {
  const cases = [
    [59, "SHA1", seed1, "94287082"], [59, "SHA256", seed256, "46119246"], [59, "SHA512", seed512, "90693936"],
    [1111111109, "SHA1", seed1, "07081804"], [1234567890, "SHA1", seed1, "89005924"], [20000000000, "SHA1", seed1, "65353130"],
  ];
  for (const [seconds, algorithm, secret, expected] of cases) {
    assert.equal(await generateTotp({ secret, digits: 8, period: 30, algorithm }, seconds * 1000), expected);
  }
});

test("6-digit code is the last six digits and keeps leading zeros", async () => {
  assert.equal(await generateTotp({ secret: seed1, digits: 6, period: 30, algorithm: "SHA1" }, 1111111109 * 1000), "081804");
});

test("base32 decoding ignores spaces, dashes and case", () => {
  assert.deepEqual(base32Decode("mzxw 6ytb-oi======"), Uint8Array.from(Buffer.from("foobar")));
});

test("parseTotpInput reads a bare secret and an otpauth link", () => {
  const bare = parseTotpInput("jbsw y3dp ehpk 3pxp", "邮箱");
  assert.deepEqual([bare.secret, bare.digits, bare.period, bare.algorithm, bare.name], ["JBSWY3DPEHPK3PXP", 6, 30, "SHA1", "邮箱"]);
  const link = parseTotpInput("otpauth://totp/Example:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&digits=8&period=60&algorithm=SHA256");
  assert.deepEqual([link.issuer, link.name, link.digits, link.period, link.algorithm], ["Example", "alice@example.com", 8, 60, "SHA256"]);
});

test("parseTotpInput rejects bad input with a plain message", () => {
  assert.throws(() => parseTotpInput(""), /粘贴/);
  assert.throws(() => parseTotpInput("not a secret!"), /密钥不对/);
  assert.throws(() => parseTotpInput("otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP"), /totp/);
  assert.throws(() => parseTotpInput("otpauth://totp/x"), /密钥/);
});

test("countdown and code grouping", () => {
  assert.equal(secondsLeft(30, 0), 30);
  assert.equal(secondsLeft(30, 29_999), 1);
  assert.equal(formatCode("123456"), "123 456");
  assert.equal(formatCode("12345678"), "1234 5678");
});

test("store encrypts at rest, round-trips, rejects duplicates and a wrong key", async () => {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
  const store = openTotpStore("device-key", storage);
  assert.deepEqual(await store.list(), []);
  const account = { id: "a", issuer: "Example", name: "alice", secret: "JBSWY3DPEHPK3PXP", digits: 6, period: 30, algorithm: "SHA1", createdAt: 1 };
  await store.add(account);
  assert.ok(!map.get(TOTP_STORAGE_KEY).includes("JBSWY3DPEHPK3PXP"));
  assert.deepEqual(await openTotpStore("device-key", storage).list(), [account]);
  await assert.rejects(store.add({ ...account, id: "b" }), /已经添加/);
  await assert.rejects(openTotpStore("other-key", storage).list(), /无法读取/);
  assert.deepEqual(await store.remove("a"), []);
});

test("two quick adds both survive", async () => {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
  const store = openTotpStore("k", storage);
  const make = (id) => ({ id, issuer: id, name: "", secret: "JBSWY3DPEHPK3PXP", digits: 6, period: 30, algorithm: "SHA1", createdAt: 1 });
  await Promise.all([store.add(make("x")), store.add(make("y"))]);
  assert.equal((await store.list()).length, 2);
});

test("secrets shorter than 16 characters are refused", () => {
  assert.throws(() => parseTotpInput("JBSWY3DP"), /16/);
  assert.doesNotThrow(() => parseTotpInput("JBSWY3DPEHPK3PXP"));
});
