const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;

function protocolError(code, message) {
  return { ok: false, error: { code, message } };
}

function normalizedError(error) {
  const code = typeof error?.code === "string" ? error.code : "COMMAND_FAILED";
  const message = error instanceof Error && error.message ? error.message : "命令执行失败";
  return protocolError(code, message);
}

function probeSocket(socketPath, timeoutMs = 120) {
  return new Promise((resolve) => {
    const socket = net.createConnection(socketPath);
    let settled = false;
    const finish = (listening) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(listening);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(timeoutMs, () => finish(false));
  });
}

async function prepareSocketPath(socketPath) {
  if (!fs.existsSync(socketPath)) return;
  let isSocket = false;
  try {
    isSocket = fs.lstatSync(socketPath).isSocket();
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  if (isSocket && await probeSocket(socketPath)) {
    const error = new Error("Clipbox automation socket is already active");
    error.code = "EADDRINUSE";
    throw error;
  }
  fs.unlinkSync(socketPath);
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("Clipbox 窗口响应超时");
      error.code = "RENDERER_TIMEOUT";
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function createAutomationServer({
  socketPath,
  forward,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
}) {
  if (typeof socketPath !== "string" || !socketPath) throw new TypeError("socketPath is required");
  if (typeof forward !== "function") throw new TypeError("forward is required");
  let server;

  async function handlePayload(socket, source) {
    let value;
    try {
      value = JSON.parse(source);
    } catch {
      socket.end(`${JSON.stringify(protocolError("INVALID_JSON", "命令不是有效的 JSON"))}\n`);
      return;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      socket.end(`${JSON.stringify(protocolError("INVALID_REQUEST", "命令必须是 JSON 对象"))}\n`);
      return;
    }
    try {
      const response = await withTimeout(Promise.resolve().then(() => forward(value)), timeoutMs);
      socket.end(`${JSON.stringify(response)}\n`);
    } catch (error) {
      socket.end(`${JSON.stringify(normalizedError(error))}\n`);
    }
  }

  function accept(socket) {
    socket.setEncoding("utf8");
    let source = "";
    let bytes = 0;
    let handled = false;

    const respondTooLarge = () => {
      if (handled) return;
      handled = true;
      socket.end(`${JSON.stringify(protocolError("REQUEST_TOO_LARGE", "命令内容过大"))}\n`);
    };
    const processSource = () => {
      if (handled) return;
      handled = true;
      const line = source.split("\n", 1)[0].trim();
      if (!line) {
        socket.end(`${JSON.stringify(protocolError("EMPTY_REQUEST", "命令不能为空"))}\n`);
        return;
      }
      void handlePayload(socket, line);
    };

    socket.on("data", (chunk) => {
      if (handled) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBytes) {
        respondTooLarge();
        return;
      }
      source += chunk;
      if (source.includes("\n")) processSource();
    });
    socket.on("end", processSource);
    socket.on("error", () => undefined);
  }

  return {
    async start() {
      if (server) return;
      const parent = path.dirname(socketPath);
      fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
      fs.chmodSync(parent, 0o700);
      await prepareSocketPath(socketPath);
      server = net.createServer({ allowHalfOpen: true }, accept);
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server?.off("listening", onListening);
          server = undefined;
          reject(error);
        };
        const onListening = () => {
          server?.off("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(socketPath);
      });
      fs.chmodSync(socketPath, 0o600);
    },
    async close() {
      const active = server;
      server = undefined;
      if (active) {
        await new Promise((resolve) => active.close(() => resolve()));
      }
      try {
        fs.unlinkSync(socketPath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    },
  };
}

function installAutomationCli({ sourcePath, targetPath }) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o755 });
  const source = fs.readFileSync(sourcePath);
  const current = fs.existsSync(targetPath) ? fs.readFileSync(targetPath) : null;
  if (!current || !source.equals(current)) fs.writeFileSync(targetPath, source, { mode: 0o755 });
  fs.chmodSync(targetPath, 0o755);
}

module.exports = { createAutomationServer, installAutomationCli };
