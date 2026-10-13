#!/usr/bin/env node

const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const COMMANDS = new Set(["status", "list", "get", "add", "update", "move", "delete", "secret"]);
const NUMBER_COMMANDS = new Set(["get", "update", "move", "delete"]);
const VALUE_OPTIONS = new Map([
  ["--title", "title"],
  ["--content", "content"],
  ["--summary", "summary"],
  ["--folder", "folder"],
  ["--chinese", "chineseText"],
  ["--query", "query"],
]);
const ALLOWED_FIELDS = {
  status: new Set(),
  list: new Set(["folder", "query"]),
  get: new Set(),
  "secret-get": new Set(),
  "secret-verify": new Set(),
  "secret-export": new Set(["password"]),
  add: new Set(["title", "content", "summary", "folder", "chineseText"]),
  update: new Set(["title", "content", "summary", "folder", "chineseText"]),
  move: new Set(["folder"]),
  delete: new Set(),
};

function usageError(message) {
  const error = new Error(message);
  error.code = "USAGE";
  return error;
}

function normalizeNumber(value) {
  const number = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^CB-\d{4,}$/.test(number)) throw usageError("编号格式必须是 CB-0001");
  return number;
}

function parseCliArguments(argv) {
  const rootCommand = argv[0];
  if (!COMMANDS.has(rootCommand)) throw usageError("用法：clipbox status|list|get|add|update|move|delete|secret get|secret verify|secret export");
  let command = rootCommand;
  let index = 1;
  if (rootCommand === "secret") {
    const subcommand = argv[index];
    if (subcommand === "export") {
      command = "secret-export";
      index += 1;
    } else {
      if (!["get", "verify"].includes(subcommand) || typeof argv[index + 1] !== "string") {
        throw usageError("用法：clipbox secret get <引用>、clipbox secret verify <引用> --clipboard，或 clipbox secret export --output <文件> --stdin --confirm");
      }
      command = `secret-${subcommand}`;
      index += 2;
    }
  }
  const parsed = { command, json: false, stdin: false, values: {} };
  if (rootCommand === "secret" && command !== "secret-export") {
    parsed.reference = argv[2];
  }
  if (NUMBER_COMMANDS.has(command)) {
    parsed.number = normalizeNumber(argv[index]);
    index += 1;
  }
  let confirmed = false;
  while (index < argv.length) {
    const option = argv[index];
    if (option === "--json") {
      parsed.json = true;
      index += 1;
      continue;
    }
    if (option === "--stdin") {
      parsed.stdin = true;
      index += 1;
      continue;
    }
    if (option === "--clipboard") {
      parsed.clipboard = true;
      index += 1;
      continue;
    }
    if (option === "--confirm") {
      confirmed = true;
      index += 1;
      continue;
    }
    if (option === "--output") {
      const outputPath = argv[index + 1];
      if (outputPath === undefined) throw usageError("--output 缺少文件路径");
      parsed.outputPath = outputPath;
      index += 2;
      continue;
    }
    const field = VALUE_OPTIONS.get(option);
    if (!field) throw usageError(`未知选项 ${option}`);
    const value = argv[index + 1];
    if (value === undefined) throw usageError(`${option} 缺少内容`);
    parsed.values[field] = value;
    index += 2;
  }
  if (command !== "secret-export" && parsed.outputPath) throw usageError("--output 只能用于 secret export");
  if (command === "delete" && !confirmed) throw usageError("删除话术必须加 --confirm");
  if (command === "secret-export" && !confirmed) throw usageError("导出秘密必须加 --confirm");
  if (command === "secret-export" && !parsed.stdin) throw usageError("导出秘密必须通过 --stdin 提供备份密码");
  if (command === "secret-export" && !parsed.outputPath) throw usageError("导出秘密必须指定 --output 文件路径");
  if (command === "secret-verify" && !parsed.clipboard) {
    throw usageError("校验秘密必须加 --clipboard，密钥不会出现在命令参数中");
  }
  if (command !== "secret-verify" && parsed.clipboard) throw usageError("--clipboard 只能用于 secret verify");
  if (confirmed) parsed.confirmed = true;
  return parsed;
}

function inputFields(parsed, stdinValue) {
  if (stdinValue === undefined || stdinValue === null || stdinValue === "") return { ...parsed.values };
  const value = typeof stdinValue === "string" ? JSON.parse(stdinValue) : stdinValue;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw usageError("标准输入必须是 JSON 对象");
  for (const field of Object.keys(value)) {
    if (!ALLOWED_FIELDS[parsed.command].has(field)) throw usageError(`标准输入包含不支持的字段 ${field}`);
  }
  return { ...value, ...parsed.values };
}

function commandToRequest(parsed, stdinValue, clipboardValue) {
  const fields = inputFields(parsed, stdinValue);
  for (const field of Object.keys(fields)) {
    if (!ALLOWED_FIELDS[parsed.command].has(field)) throw usageError(`命令不支持字段 ${field}`);
  }
  const request = { action: parsed.command };
  if (parsed.number) request.number = parsed.number;
  if (parsed.reference) request.reference = parsed.reference;
  if (parsed.command === "secret-verify") {
    if (typeof clipboardValue !== "string" || clipboardValue.length === 0) throw usageError("剪贴板为空，无法校验");
    request.candidate = clipboardValue;
  }
  Object.assign(request, fields);
  if (parsed.command === "delete") request.confirmed = true;
  if (parsed.command === "secret-export") request.confirmed = true;
  return request;
}

function readClipboard() {
  const result = spawnSync("pbpaste", [], { encoding: "utf8", maxBuffer: 128 * 1024 });
  if (result.error || result.status !== 0) throw usageError("无法读取系统剪贴板");
  if (!result.stdout) throw usageError("剪贴板为空，无法校验");
  return result.stdout;
}

function defaultSocketPath() {
  return path.join(os.homedir(), "Library", "Application Support", "Clipbox", "automation.sock");
}

function sendRequest(socketPath, request) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let source = "";
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.end(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk) => { source += chunk; });
    socket.once("end", () => {
      try {
        resolve(JSON.parse(source.trim()));
      } catch {
        const error = new Error("Clipboxx 返回了无效响应");
        error.code = "INVALID_RESPONSE";
        reject(error);
      }
    });
    socket.once("error", reject);
  });
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let source = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { source += chunk; });
    process.stdin.once("end", () => {
      try {
        resolve(source.trim() ? JSON.parse(source) : {});
      } catch {
        reject(usageError("标准输入不是有效的 JSON"));
      }
    });
    process.stdin.once("error", reject);
  });
}

function humanOutput(response) {
  if (response.action === "status") return `Clipboxx 已连接，${response.snippetCount} 条话术`;
  if (response.action === "list") {
    if (!response.items?.length) return "没有话术";
    return response.items.map((item) => `${item.number}\t${item.folder ? `[${item.folder}] ` : ""}${item.title}`).join("\n");
  }
  if (response.action === "delete") return `已移入回收站 ${response.number}`;
  if (response.action === "secret-get") return "秘密已读取；需要交给任务使用时请加 --json";
  if (response.action === "secret-verify") {
    const describe = (profile) => [
      `${profile.chars} 字符`,
      `${profile.bytes} 字节`,
      profile.ascii ? "ASCII" : "非 ASCII",
      profile.appSecretFormat ? "符合 App Secret 格式" : "不符合 App Secret 格式",
    ].join("、");
    return [
      response.match ? "匹配：剪贴板与 Clipboxx 内容完全一致" : "不匹配：剪贴板与 Clipboxx 内容不同",
      `剪贴板：${describe(response.clipboard)}`,
      `Clipboxx：${describe(response.stored)}`,
    ].join("\n");
  }
  if (response.action === "secret-export") return `已将 ${response.secretCount} 条秘密加密导出到 ${response.path}`;
  const item = response.item;
  if (!item) return "操作完成";
  if (response.action === "get") {
    return [
      `${item.number} ${item.title}`,
      item.folder ? `目录：${item.folder}` : "目录：未分类",
      item.summary ? `总结：${item.summary}` : "",
      item.content ? `英文：${item.content}` : "",
      item.chineseText ? `中文：${item.chineseText}` : "",
    ].filter(Boolean).join("\n");
  }
  return `${response.action === "add" ? "已新增" : "已更新"} ${item.number} ${item.title}`;
}

function writeSecretBackup(outputPath, response) {
  const backup = response?.backup;
  if (
    !backup
    || backup.format !== "clipbox-secure-backup"
    || backup.version !== 3
    || backup.scope !== "secret"
    || backup.envelope?.version !== 1
    || typeof backup.envelope?.ciphertext !== "string"
    || typeof backup.envelope?.salt !== "string"
    || typeof backup.envelope?.iv !== "string"
  ) {
    throw new Error("Clipboxx 返回了无效的秘密备份");
  }
  const target = path.resolve(outputPath);
  fs.writeFileSync(target, JSON.stringify(backup), { encoding: "utf8", flag: "wx", mode: 0o600 });
  fs.chmodSync(target, 0o600);
  return { ok: true, action: "secret-export", path: target, secretCount: Number(response.secretCount) || 0 };
}

async function run(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseCliArguments(argv);
    const stdinValue = parsed.stdin ? await readStdin() : undefined;
    const clipboardValue = parsed.clipboard ? readClipboard() : undefined;
    const request = commandToRequest(parsed, stdinValue, clipboardValue);
    const socketPath = process.env.CLIPBOX_AUTOMATION_SOCKET_PATH || defaultSocketPath();
    const response = await sendRequest(socketPath, request);
    if (!response?.ok) {
      process.stderr.write(`${response?.error?.message || "命令执行失败"}\n`);
      process.exitCode = 1;
      return;
    }
    const printable = parsed.command === "secret-export" ? writeSecretBackup(parsed.outputPath, response) : response;
    process.stdout.write(`${parsed.json ? JSON.stringify(printable) : humanOutput(printable)}\n`);
  } catch (error) {
    if (["ENOENT", "ECONNREFUSED"].includes(error?.code)) {
      process.stderr.write("Clipboxx 未打开，请先打开应用。\n");
      process.exitCode = 2;
      return;
    }
    process.stderr.write(`${error instanceof Error ? error.message : "命令执行失败"}\n`);
    process.exitCode = error?.code === "USAGE" ? 2 : 1;
  }
}

if (require.main === module) void run();

module.exports = {
  commandToRequest,
  defaultSocketPath,
  humanOutput,
  parseCliArguments,
  readClipboard,
  run,
  sendRequest,
};
