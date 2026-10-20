// A pretend Copyboxx server for the web preview (and the browser tests), so 登录 and 同步 can be tried before the real
// one is live. It keeps everything in this browser's storage and follows the same rules as the real server
// (D-064): any email gets the code 123456, an upload with an old version number is refused, and at most 3 computers stay
// signed in to one email (D-069; sessions are kept in sign-in order).
import type { CloudRequest, CloudResponse } from "./cloud-client.ts";

export const DEMO_CODE = "123456";
// Emails outside DEMO_DOMAIN need an activation code (D-085); the pretend server takes this one, any number of times.
export const DEMO_ACTIVATION = "AAAA-BBBB-CCCC-DDDD";
export const CLOUD_DEMO_KEY = "clipbox.cloud-demo.v1";

// Company 话术 by email domain: the pretend server binds example.com to this small library; every other domain has none.
export const DEMO_DOMAIN = "example.com";
export const DEMO_DOMAIN_LIBRARY = {
  format: "clipbox-shared-library",
  version: 1,
  items: [
    { id: "DEMO-DOMAIN-1", folder: "询盘接待", label: "公司欢迎语", secret: "您好，感谢联系我们！请问有什么可以帮您？" },
    { id: "DEMO-DOMAIN-2", folder: "报价成交", label: "公司报价说明", secret: "报价含包装，不含运费，有效期 7 天。" },
    { id: "DEMO-DOMAIN-3", folder: "物流清关", label: "公司发货时间", secret: "下单后 3 个工作日内发货，发货后会发您单号。" },
  ],
};

type DemoState = {
  vaults: Record<string, { version: number; data: unknown }>;
  sessions: Record<string, string>;
  sent: Record<string, boolean>;
  // Optional (older saved states lack them): each session's device name, and tokens a newer sign-in ended.
  devices?: Record<string, string>;
  ended?: Record<string, true>;
  activated?: Record<string, true>;
};
const MAX_DEVICES = 3;

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
    state.devices = { ...state.devices, [token]: typeof body.device === "string" ? body.device : "" };
    delete state.sent[email];
    const mine = Object.keys(state.sessions).filter((key) => state.sessions[key] === email);
    const signedOut = mine.slice(0, Math.max(0, mine.length - MAX_DEVICES)).map((old) => {
      const name = state.devices?.[old] || "一台电脑";
      delete state.sessions[old];
      delete state.devices?.[old];
      state.ended = { ...state.ended, [old]: true };
      return name;
    });
    save(state);
    const activated = email.endsWith(`@${DEMO_DOMAIN}`) || Boolean(state.activated?.[email]);
    return reply(200, { token, email, signedOut, activated });
  }
  const owner = request.token ? state.sessions[request.token] : undefined;
  if (!owner) return reply(401, { error: request.token && state.ended?.[request.token] ? "device_limit" : "unauthorized" });
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
  if (request.path === "/api/vault/too-large" && request.method === "POST") return reply(200, { ok: true });
  if (request.path === "/api/library" && request.method === "GET") {
    const domain = owner.slice(owner.lastIndexOf("@") + 1).toLowerCase();
    return reply(200, domain === DEMO_DOMAIN ? { domain, library: DEMO_DOMAIN_LIBRARY } : { domain: null, library: null });
  }
  if (request.path === "/api/activate" && request.method === "POST") {
    const code = typeof body.code === "string" ? body.code.replace(/[^0-9a-z]/gi, "").toUpperCase() : "";
    if (code !== DEMO_ACTIVATION.replace(/-/g, "")) return reply(400, { error: "bad_activation_code" });
    state.activated = { ...state.activated, [owner]: true };
    save(state);
    return reply(200, { activated: true });
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
