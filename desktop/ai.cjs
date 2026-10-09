// Keeps the user's own AI interface key on this computer, encrypted with the
// operating system (DPAPI on Windows), and sends requests on the app's behalf so
// the key never has to live in the page.
const REQUEST_TIMEOUT_MS = 60_000;

function parseEndpoint(value) {
  let url;
  try { url = new URL(String(value)); } catch { throw new Error("接口地址无效"); }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new Error("接口地址需要 https://（本机地址可用 http://）");
  return url;
}

function createAiStore({ filePath, fs, safeStorage, fetchImpl = fetch }) {
  function read() {
    try {
      if (!fs.existsSync(filePath)) return null;
      const stored = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (typeof stored.origin !== "string" || typeof stored.data !== "string") return null;
      return { origin: stored.origin, key: safeStorage.decryptString(Buffer.from(stored.data, "base64")) };
    } catch {
      return null;
    }
  }

  function status() {
    const current = read();
    return { hasKey: Boolean(current), origin: current?.origin || "" };
  }

  // An empty key keeps the saved one, but only for the same server.
  function save({ baseUrl, key }) {
    const origin = parseEndpoint(baseUrl).origin;
    const nextKey = typeof key === "string" ? key.trim() : "";
    const current = read();
    const finalKey = nextKey || (current && current.origin === origin ? current.key : "");
    if (!finalKey) throw new Error("请填写 API Key");
    if (!safeStorage.isEncryptionAvailable()) throw new Error("这台电脑的系统不支持安全保存密钥");
    const data = safeStorage.encryptString(finalKey).toString("base64");
    fs.writeFileSync(filePath, JSON.stringify({ origin, data }), { mode: 0o600 });
    return status();
  }

  function clear() {
    fs.rmSync(filePath, { force: true });
    return status();
  }

  async function request({ url, body, method }) {
    const get = method === "GET";
    const target = parseEndpoint(url);
    const current = read();
    if (!current) throw new Error("还没有保存 API Key");
    if (current.origin !== target.origin) throw new Error("接口地址与已保存的密钥不匹配，请在设置里重新保存");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(target, {
        method: get ? "GET" : "POST",
        headers: { ...(get ? {} : { "content-type": "application/json" }), authorization: `Bearer ${current.key}` },
        ...(get ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
        signal: controller.signal,
      });
      return { ok: response.ok, status: response.status, text: await response.text() };
    } catch (error) {
      throw new Error(error?.name === "AbortError" ? "请求超时" : "无法连接到接口");
    } finally {
      clearTimeout(timer);
    }
  }

  return { status, save, clear, request };
}

module.exports = { createAiStore, parseEndpoint };
