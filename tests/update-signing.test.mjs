import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  checkInstallerSignature,
  generateKey,
  parsePublicKey,
  parseSecretKey,
  publicKeyPath,
  signBytes,
  trustedComment,
  verifyBytes,
} from "../tools/update-signing.mjs";

// D-053: installers are signed in minisign format; the app checks them with the minisign-verify crate.
const password = "only-for-these-tests";
const pair = generateKey(password);
const secret = parseSecretKey(pair.secret, password);
const installer = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(10_000, 3)]);

test("update signing: a good signature verifies and names the version it was made for", () => {
  const sig = signBytes(installer, secret, trustedComment("1.80.0", "Copyboxx-Windows-setup.exe", 1760000000));
  const lines = sig.trimEnd().split("\n");
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^untrusted comment: /);
  // "ED" = prehashed Ed25519, the only mode the app accepts (it checks while downloading).
  assert.equal(Buffer.from(lines[1], "base64").subarray(0, 2).toString(), "ED");
  assert.equal(lines[2], "trusted comment: version:1.80.0\tfile:Copyboxx-Windows-setup.exe\ttimestamp:1760000000");
  assert.deepEqual(checkInstallerSignature(installer, sig, "1.80.0", pair.public), { version: "1.80.0", file: "Copyboxx-Windows-setup.exe", timestamp: "1760000000" });
  // Windows line endings (a .sig edited on Windows) still verify.
  assert.equal(verifyBytes(installer, sig.replaceAll("\n", "\r\n"), parsePublicKey(pair.public)).version, "1.80.0");
});

test("update signing: a wrong signature is refused", () => {
  const sig = signBytes(installer, secret, trustedComment("1.80.0", "a.exe"));
  const changed = Buffer.from(installer);
  changed[500] ^= 1;
  assert.throws(() => checkInstallerSignature(changed, sig, "1.80.0", pair.public), /does not match the installer/);
  assert.throws(() => checkInstallerSignature(installer, sig, "1.81.0", pair.public), /for version 1\.80\.0, not 1\.81\.0/);
  const other = generateKey(password);
  assert.throws(() => checkInstallerSignature(installer, sig, "1.80.0", other.public), /another key/);
  // Editing the signed comment breaks the second signature.
  const edited = sig.replace("version:1.80.0", "version:1.99.0");
  assert.throws(() => checkInstallerSignature(installer, edited, "1.99.0", pair.public), /trusted comment was changed/);
});

test("update signing: a missing or malformed signature is refused", () => {
  assert.throws(() => checkInstallerSignature(installer, "", "1.80.0", pair.public), /not in minisign format/);
  assert.throws(() => checkInstallerSignature(installer, "untrusted comment: x\nabc\n", "1.80.0", pair.public), /not in minisign format/);
});

test("update signing: the key file needs its password and keys are made only with a long one", () => {
  assert.throws(() => parseSecretKey(pair.secret, "wrong-password-here"), /wrong UPDATE_SIGNING_PASSWORD/);
  assert.throws(() => parseSecretKey("", password), /not a Copyboxx update signing key/);
  assert.throws(() => generateKey("short"), /at least 12 characters/);
  assert.match(pair.secret, /-----BEGIN ENCRYPTED PRIVATE KEY-----/);
  assert.doesNotMatch(pair.secret, /BEGIN PRIVATE KEY/);
  assert.throws(() => trustedComment("1.80", "a.exe"), /app version like 1\.80\.0/);
  assert.throws(() => trustedComment("1.80.0", "a b.exe"), /Unexpected installer name/);
});

test("update signing: the app's public key file is a minisign key and no private key is in the repo", () => {
  const text = readFileSync(publicKeyPath, "utf8");
  assert.equal(parsePublicKey(text).keyId.length, 8);
  assert.doesNotMatch(text, /PRIVATE KEY/);
});

test("update signing: the command line signs and verifies a file", () => {
  const dir = mkdtempSync(join(tmpdir(), "clipbox-sign-"));
  try {
    const file = join(dir, "Copyboxx-Windows-setup.exe");
    writeFileSync(file, installer);
    const pub = join(dir, "key.pub");
    writeFileSync(pub, pair.public);
    const env = { ...process.env, UPDATE_SIGNING_KEY: pair.secret, UPDATE_SIGNING_PASSWORD: password, UPDATE_PUBLIC_KEY_FILE: pub };
    const out = execFileSync(process.execPath, ["tools/update-signing.mjs", "sign", "--version", "1.80.0", file], { env, encoding: "utf8" });
    assert.match(out, /signature ok for Copyboxx-Windows-setup\.exe version 1\.80\.0/);
    assert.equal(checkInstallerSignature(installer, readFileSync(`${file}.sig`, "utf8"), "1.80.0", pair.public).file, "Copyboxx-Windows-setup.exe");
    assert.throws(() => execFileSync(process.execPath, ["tools/update-signing.mjs", "verify", "--version", "1.81.0", file], { env, stdio: "pipe" }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
