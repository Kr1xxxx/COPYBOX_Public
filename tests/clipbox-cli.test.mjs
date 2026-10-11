import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
let cli;
try {
  cli = require("../tools/clipbox-cli.cjs");
} catch {
  cli = undefined;
}

const cliPath = path.resolve("tools/clipbox-cli.cjs");

function temporaryPath(name = "automation.sock") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "clipbox-cli-"));
  return { directory, target: path.join(directory, name) };
}

function runCli(args, { socketPath, input = "" } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: { ...process.env, CLIPBOX_AUTOMATION_SOCKET_PATH: socketPath || "" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.stdin.end(input);
  });
}

function createFakeServer(socketPath, responder, requests) {
  const server = net.createServer({ allowHalfOpen: true }, (socket) => {
    socket.setEncoding("utf8");
    let source = "";
    socket.on("data", (chunk) => { source += chunk; });
    socket.on("end", () => {
      const request = JSON.parse(source.trim());
      requests.push(request);
      socket.end(`${JSON.stringify(responder(request))}\n`);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => resolve(server));
  });
}

test("parses command flags into a strict automation request", () => {
  assert.equal(typeof cli?.parseCliArguments, "function");
  assert.deepEqual(cli.parseCliArguments(["get", "cb-0003", "--json"]), {
    command: "get",
    number: "CB-0003",
    json: true,
    stdin: false,
    values: {},
  });
  assert.deepEqual(
    cli.commandToRequest(cli.parseCliArguments(["update", "CB-0003", "--content", "New copy", "--folder", "跟进"])),
    { action: "update", number: "CB-0003", content: "New copy", folder: "跟进" },
  );
  assert.throws(() => cli.parseCliArguments(["delete", "CB-0003"]), /--confirm/);
  assert.throws(() => cli.parseCliArguments(["list", "--wat"]), /未知选项/);
});

test("parses an exact secret reference without turning it into a snippet command", () => {
  const reference = "clipbox://secret/secret-id";
  assert.deepEqual(cli.parseCliArguments(["secret", "get", reference, "--json"]), {
    command: "secret-get",
    reference,
    json: true,
    stdin: false,
    values: {},
  });
  assert.deepEqual(
    cli.commandToRequest(cli.parseCliArguments(["secret", "get", reference, "--json"])),
    { action: "secret-get", reference },
  );
});

test("builds a confirmed stdin-only secret export request without sending the output path", () => {
  const output = "/tmp/clipbox-secrets.json";
  const parsed = cli.parseCliArguments(["secret", "export", "--output", output, "--stdin", "--confirm"]);

  assert.deepEqual(parsed, {
    command: "secret-export",
    outputPath: output,
    confirmed: true,
    json: false,
    stdin: true,
    values: {},
  });
  assert.deepEqual(cli.commandToRequest(parsed, { password: "backup-password" }), {
    action: "secret-export",
    password: "backup-password",
    confirmed: true,
  });
  assert.throws(() => cli.parseCliArguments(["secret", "export", "--output", output, "--stdin"]), /--confirm/);
  assert.throws(() => cli.parseCliArguments(["secret", "export", "--output", output, "--confirm"]), /--stdin/);
  assert.throws(() => cli.parseCliArguments(["secret", "export", "--stdin", "--confirm"]), /--output/);
  assert.throws(() => cli.parseCliArguments(["list", "--output", output]), /--output 只能用于 secret export/);
});

test("builds a clipboard-only secret verification request without exposing the value", () => {
  const reference = "clipbox://secret/secret-id";
  const syntheticCandidate = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  const parsed = cli.parseCliArguments(["secret", "verify", reference, "--clipboard", "--json"]);

  assert.deepEqual(parsed, {
    command: "secret-verify",
    reference,
    clipboard: true,
    json: true,
    stdin: false,
    values: {},
  });
  assert.deepEqual(cli.commandToRequest(parsed, undefined, syntheticCandidate), {
    action: "secret-verify",
    reference,
    candidate: syntheticCandidate,
  });
  assert.throws(
    () => cli.parseCliArguments(["secret", "verify", reference]),
    /--clipboard/,
  );

  const output = cli.humanOutput({
    ok: true,
    action: "secret-verify",
    match: false,
    clipboard: { chars: 32, bytes: 32, ascii: true, appSecretFormat: true },
    stored: { chars: 2, bytes: 6, ascii: false, appSecretFormat: false },
  });
  assert.equal(output.includes(syntheticCandidate), false);
  assert.match(output, /不匹配/);
  assert.match(output, /32 字符/);
  assert.match(output, /2 字符/);
});

test("prints human and JSON responses from a live socket", async () => {
  const temporary = temporaryPath();
  const requests = [];
  const server = await createFakeServer(
    temporary.target,
    (request) => request.action === "status"
      ? { ok: true, action: "status", ready: true, snippetCount: 1 }
      : { ok: true, action: "get", item: { number: "CB-0003", title: "Greeting", content: "Hello", summary: "Hi", folder: "开发" } },
    requests,
  );
  try {
    const status = await runCli(["status"], { socketPath: temporary.target });
    const get = await runCli(["get", "CB-0003", "--json"], { socketPath: temporary.target });
    assert.deepEqual(status, { code: 0, stdout: "Clipbox 已连接，1 条话术", stderr: "" });
    assert.equal(JSON.parse(get.stdout).item.content, "Hello");
    assert.deepEqual(requests, [{ action: "status" }, { action: "get", number: "CB-0003" }]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporary.directory, { recursive: true, force: true });
  }
});

test("reveals a secret reference only in explicit JSON output", async () => {
  const temporary = temporaryPath();
  const requests = [];
  const reference = "clipbox://secret/secret-id";
  const server = await createFakeServer(
    temporary.target,
    () => ({ ok: true, action: "secret-get", secret: { reference, title: "Test key", value: "synthetic-value", folder: "API", updatedAt: 1 } }),
    requests,
  );
  try {
    const human = await runCli(["secret", "get", reference], { socketPath: temporary.target });
    const json = await runCli(["secret", "get", reference, "--json"], { socketPath: temporary.target });
    assert.deepEqual(human, { code: 0, stdout: "秘密已读取；需要交给任务使用时请加 --json", stderr: "" });
    assert.equal(JSON.parse(json.stdout).secret.value, "synthetic-value");
    assert.deepEqual(requests, [
      { action: "secret-get", reference },
      { action: "secret-get", reference },
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporary.directory, { recursive: true, force: true });
  }
});

test("writes an encrypted secret backup with owner-only permissions and no ciphertext output", async () => {
  const temporary = temporaryPath("automation.sock");
  const outputPath = path.join(temporary.directory, "secrets.json");
  const requests = [];
  const backup = {
    format: "clipbox-secure-backup",
    version: 3,
    scope: "secret",
    createdAt: 123,
    envelope: { version: 1, salt: "salt", iv: "iv", ciphertext: "synthetic-ciphertext", iterations: 310000, updatedAt: 123 },
  };
  const server = await createFakeServer(
    temporary.target,
    () => ({ ok: true, action: "secret-export", secretCount: 2, backup }),
    requests,
  );
  try {
    const result = await runCli(
      ["secret", "export", "--output", outputPath, "--stdin", "--confirm"],
      { socketPath: temporary.target, input: JSON.stringify({ password: "backup-password" }) },
    );
    assert.equal(result.code, 0);
    assert.match(result.stdout, /2 条秘密/);
    assert.equal(result.stdout.includes("synthetic-ciphertext"), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), backup);
    assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
    assert.deepEqual(requests, [{ action: "secret-export", password: "backup-password", confirmed: true }]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporary.directory, { recursive: true, force: true });
  }
});

test("merges standard-input JSON while explicit flags win", async () => {
  const temporary = temporaryPath();
  const requests = [];
  const server = await createFakeServer(
    temporary.target,
    (request) => ({ ok: true, action: "update", item: { number: request.number, title: request.title, content: request.content, summary: "", folder: "" } }),
    requests,
  );
  try {
    const result = await runCli(
      ["update", "CB-0003", "--content", "From flag", "--stdin", "--json"],
      { socketPath: temporary.target, input: JSON.stringify({ title: "From stdin", content: "From stdin" }) },
    );
    assert.equal(result.code, 0);
    assert.deepEqual(requests[0], { action: "update", number: "CB-0003", title: "From stdin", content: "From flag" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporary.directory, { recursive: true, force: true });
  }
});

test("uses nonzero exits for server errors and a closed application", async () => {
  const temporary = temporaryPath();
  const requests = [];
  const server = await createFakeServer(
    temporary.target,
    () => ({ ok: false, error: { code: "NOT_FOUND", message: "未找到话术 CB-9999" } }),
    requests,
  );
  try {
    const failed = await runCli(["get", "CB-9999"], { socketPath: temporary.target });
    assert.equal(failed.code, 1);
    assert.equal(failed.stderr, "未找到话术 CB-9999");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  const closed = await runCli(["status"], { socketPath: temporary.target });
  assert.equal(closed.code, 2);
  assert.equal(closed.stderr, "Clipbox 未打开，请先打开应用。");
  fs.rmSync(temporary.directory, { recursive: true, force: true });
});
