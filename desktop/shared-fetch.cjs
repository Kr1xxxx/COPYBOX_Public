// Reads the company 话术 library file from the address the user typed in Settings.
// A plain GET: no cookies and no keys are sent, only http(s) addresses are allowed, the answer is size-limited.
const TIMEOUT_MS = 15000;
const MAX_BYTES = 5 * 1024 * 1024;

function parseSharedUrl(value) {
  let url;
  try { url = new URL(String(value || "").trim()); } catch { throw new Error("地址不对，要以 https:// 开头"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("地址不对，要以 https:// 开头");
  if (url.username || url.password) throw new Error("地址里不要带账号密码");
  return url;
}

async function fetchSharedText(value, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS, maxBytes = MAX_BYTES } = {}) {
  const url = parseSharedUrl(value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: "GET", headers: { accept: "application/json" }, credentials: "omit", cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`公司话术库地址打不开（${response.status}）`);
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error("公司话术库文件太大");
    return text;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("连接公司话术库超时");
    if (error instanceof Error && /公司话术库/.test(error.message)) throw error;
    throw new Error("无法连接到公司话术库地址");
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchSharedText, parseSharedUrl };
