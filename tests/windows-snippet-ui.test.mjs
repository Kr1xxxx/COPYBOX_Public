import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { webcrypto } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const electron = require("electron");
const execFileAsync = promisify(execFile);

function base64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function encryptedVault(data) {
  const deviceKey = base64(new Uint8Array(32).fill(7));
  const salt = new Uint8Array(16).fill(11);
  const iv = new Uint8Array(12).fill(13);
  const material = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(deviceKey),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await webcrypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310_000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const now = 1_700_000_000_000;
  const defaultData = {
    items: [
      { id: "secret-test", label: "不应保留的秘密", secret: "secret-value", note: "", color: "#fff", kind: "secret", folder: "私人", createdAt: now, updatedAt: now },
      { id: "snippet-test", label: "保留的话术", secret: "Hello", note: "", color: "#fff", kind: "snippet", folder: "客服", createdAt: now, updatedAt: now },
    ],
    folders: { secret: ["私人"], snippet: ["客服"] },
  };
  const ciphertext = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(data || defaultData)),
  );
  return {
    deviceKey,
    envelope: JSON.stringify({
      version: 1,
      salt: base64(salt),
      iv: base64(iv),
      ciphertext: base64(new Uint8Array(ciphertext)),
      iterations: 310_000,
      updatedAt: now,
    }),
  };
}

async function renderSnippetUi(width = 680, height = 620, options = {}) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.CLIPBOX_TEST_WIDTH = String(width);
  env.CLIPBOX_TEST_HEIGHT = String(height);
  if (options.noPreload) env.CLIPBOX_TEST_NO_PRELOAD = "1";
  if (options.seedLegacyVault) env.CLIPBOX_TEST_SEED_LEGACY = "1";
  if (options.seedCurrentVault) {
    const seed = await encryptedVault(
      typeof options.seedCurrentVault === "object" ? options.seedCurrentVault : undefined,
    );
    env.CLIPBOX_TEST_CURRENT_VAULT = seed.envelope;
    env.CLIPBOX_TEST_DEVICE_KEY = seed.deviceKey;
  }
  const { stdout } = await execFileAsync(electron, ["tests/fixtures/electron-snippet-ui.cjs"], {
    cwd: new URL("..", import.meta.url),
    env,
    timeout: 25_000,
    maxBuffer: 1024 * 1024,
  });
  const line = stdout.split("\n").find((value) => value.startsWith("CLIPBOX_RESULT="));
  assert.ok(line, `Electron fixture did not return UI data:\n${stdout}`);
  return JSON.parse(line.slice("CLIPBOX_RESULT=".length));
}

test("renders the Windows edition without secret or export controls", { timeout: 30_000 }, async () => {
  const result = await renderSnippetUi();

  assert.equal(result.hasKindSwitcher, false);
  assert.equal(result.hasSnippetHeading, true);
  assert.deepEqual(result.emptyActionLabels, ["导入 Clipbox 备份", "新建话术"]);
  assert.doesNotMatch(result.text, /秘密|导出安全备份/);
  assert.match(result.text, /话术库/);
  assert.match(result.text, /导入话术备份/);
});

test("keeps the Windows import action on one line at the minimum window size", { timeout: 30_000 }, async () => {
  const result = await renderSnippetUi(500, 520);

  assert.equal(result.sidebarImportFits, true);
});

test("removes legacy vault archives in the Windows edition", { timeout: 30_000 }, async () => {
  const result = await renderSnippetUi(680, 620, { seedLegacyVault: true });

  assert.equal(result.hasLegacyVault, false);
});

test("removes secrets from the current encrypted Windows vault", { timeout: 30_000 }, async () => {
  const result = await renderSnippetUi(680, 620, { seedCurrentVault: true });

  assert.equal(result.currentVaultRewritten, true);
  assert.match(result.text, /保留的话术/);
  assert.doesNotMatch(result.text, /不应保留的秘密|secret-value|私人/);
});

test("removes secret-only folder metadata from the encrypted Windows vault", { timeout: 30_000 }, async () => {
  const result = await renderSnippetUi(680, 620, {
    seedCurrentVault: { items: [], folders: { secret: ["银行密码"], snippet: [] } },
  });

  assert.equal(result.currentVaultRewritten, true);
  assert.doesNotMatch(result.text, /银行密码/);
});

test("shows a blocking error instead of the full edition when preload is missing", { timeout: 30_000 }, async () => {
  const result = await renderSnippetUi(680, 620, { noPreload: true });

  assert.equal(result.hasStartupError, true);
  assert.doesNotMatch(result.text, /秘密|导出安全备份/);
});
