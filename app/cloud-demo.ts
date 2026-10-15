// A pretend Copyboxx server for the web preview (and the browser tests), so 登录 and 同步 can be tried before the real
// one is live. It keeps everything in this browser's storage and follows the same rules as the real server
// (D-064): any email gets the code 123456, and an upload with an old version number is refused.
import type { CloudRequest, CloudResponse } from "./cloud-client.ts";

export const DEMO_CODE = "123456";
export const CLOUD_DEMO_KEY = "clipbox.cloud-demo.v1";

type DemoState = { vaults: Record<string, { version: number; data: unknown }>; sessions: Record<string, string>; sent: Record<string, boolean> };

function load(): DemoState {
  try {
    const value = JSON.parse(localStorage.getItem(CLOUD_DEMO_KEY) || "null") as DemoState | null;
    if (value && value.vaults && value.sessions && value.sent) return value;
  } catch { /* start empty */ }
  return { vaults: {}, sessions: {}, sent: {} };
}

function save(state: DemoState) {
  localStorage.setItem(CLOUD_DEMO_KEY, JSON.stringify(state));
}

const reply = (status: number, body: unknown = { ok: true }): CloudResponse => ({ status, text: JSON.stringify(body) });

export async function demoCloudRequest(request: CloudRequest): Promise<CloudResponse> {
  await new Promise((resolve) => setTimeout(resolve, 250));
  const state = load();
  const body = (request.body ?? {}) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email : "";
  if (request.path === "/api/auth/code" && request.method === "POST") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return reply(400, { error: "bad_email" });
    state.sent[email] = true;
    save(state);
    return reply(200);
  }
  if (request.path === "/api/auth/verify" && request.method === "POST") {
    if (!state.sent[email] || body.code !== DEMO_CODE) return reply(401, { error: "bad_code" });
    const token = `demo-${crypto.randomUUID()}`;
    state.sessions[token] = email;
    delete state.sent[email];
    save(state);
    return reply(200, { token, email });
  }
  const owner = request.token ? state.sessions[request.token] : undefined;
  if (!owner) return reply(401, { error: "unauthorized" });
  if (request.path === "/api/vault" && request.method === "GET") {
    const vault = state.vaults[owner];
    return reply(200, vault ?? { version: 0, data: null });
  }
  if (request.path === "/api/vault" && request.method === "PUT") {
    const current = state.vaults[owner]?.version ?? 0;
    // Like the live server while the copies live in D1: at most 1.9 MB of data.
    if (new TextEncoder().encode(JSON.stringify(body.data)).length > 1_900_000) return reply(413, { error: "too_large" });
    if (body.baseVersion !== current) return reply(409, { error: "version_conflict", version: current });
    state.vaults[owner] = { version: current + 1, data: body.data };
    save(state);
    return reply(200, { version: current + 1 });
  }
  if (request.path === "/api/auth/logout" && request.method === "POST") {
    delete state.sessions[request.token!];
    save(state);
    return reply(200);
  }
  if (request.path === "/api/account" && request.method === "DELETE") {
    delete state.vaults[owner];
    for (const [token, who] of Object.entries(state.sessions)) if (who === owner) delete state.sessions[token];
    save(state);
    return reply(200);
  }
  return reply(404, { error: "not_found" });
}
