// Which website or service a 保险箱 entry belongs to, and how its round badge looks (Mac only). Pure functions.
// No network here: the badge is a coloured circle with the site's initial; a real icon can be added later (kept on this device).

export type Site = { key: string; name: string; color: string; letter: string };

type KnownSite = Site & { domains: string[]; names: string[]; apiPrefixes?: string[] };

const KNOWN: KnownSite[] = [
  { key: "amazon", name: "Amazon", color: "#ff9900", letter: "a", domains: ["amazon.com", "amazon.co.uk", "amazon.de", "amazon.co.jp", "amazon.ca", "amazonaws.com", "aws.amazon.com"], names: ["amazon", "亚马逊", "亞馬遜"] },
  { key: "shopify", name: "Shopify", color: "#5a863e", letter: "S", domains: ["shopify.com", "myshopify.com"], names: ["shopify"], apiPrefixes: ["shpat_", "shpss_", "shpca_"] },
  { key: "paypal", name: "PayPal", color: "#003087", letter: "P", domains: ["paypal.com", "paypal.me"], names: ["paypal"] },
  { key: "wise", name: "Wise", color: "#2f7d32", letter: "W", domains: ["wise.com", "transferwise.com"], names: ["wise", "transferwise"] },
  { key: "google", name: "Google", color: "#4285f4", letter: "G", domains: ["google.com", "gmail.com", "googlemail.com", "googleapis.com", "youtube.com"], names: ["google", "gmail", "谷歌", "骨骼"], apiPrefixes: ["AIza", "ya29."] },
  { key: "alibaba", name: "阿里巴巴", color: "#ff6a00", letter: "阿", domains: ["alibaba.com", "1688.com", "aliexpress.com", "alibabacloud.com", "aliyun.com"], names: ["alibaba", "阿里", "阿里巴巴", "阿里国际站", "阿里國際站", "aliexpress"] },
  { key: "dhl", name: "DHL", color: "#d40511", letter: "D", domains: ["dhl.com"], names: ["dhl"] },
  { key: "fedex", name: "FedEx", color: "#4d148c", letter: "F", domains: ["fedex.com"], names: ["fedex"] },
  { key: "ups", name: "UPS", color: "#351c15", letter: "U", domains: ["ups.com"], names: ["ups"] },
  { key: "openai", name: "OpenAI", color: "#10a37f", letter: "O", domains: ["openai.com", "chatgpt.com"], names: ["openai", "chatgpt"], apiPrefixes: ["sk-proj-", "sk-"] },
  { key: "anthropic", name: "Anthropic", color: "#d97757", letter: "A", domains: ["anthropic.com", "claude.ai"], names: ["anthropic", "claude"], apiPrefixes: ["sk-ant-"] },
  { key: "github", name: "GitHub", color: "#24292f", letter: "G", domains: ["github.com"], names: ["github"], apiPrefixes: ["ghp_", "github_pat_", "gho_"] },
  { key: "meta", name: "Meta", color: "#1877f2", letter: "f", domains: ["facebook.com", "instagram.com", "whatsapp.com", "meta.com"], names: ["facebook", "instagram", "whatsapp", "meta"] },
  { key: "microsoft", name: "Microsoft", color: "#00a4ef", letter: "M", domains: ["microsoft.com", "outlook.com", "office.com", "live.com"], names: ["microsoft", "outlook"] },
  { key: "stripe", name: "Stripe", color: "#635bff", letter: "S", domains: ["stripe.com"], names: ["stripe"], apiPrefixes: ["sk_live_", "sk_test_", "pk_live_", "pk_test_", "rk_live_"] },
  { key: "slack", name: "Slack", color: "#4a154b", letter: "S", domains: ["slack.com"], names: ["slack"], apiPrefixes: ["xoxb-", "xoxp-", "xapp-"] },
];

// Domains with a two-part public suffix, so "shop.example.co.uk" is grouped as "example.co.uk".
const TWO_PART_SUFFIX = new Set(["co.uk", "com.cn", "com.au", "co.jp", "com.hk", "com.tw", "com.br", "co.in", "org.uk", "net.cn"]);

export function normalizeUrl(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
}

export function hostnameOf(raw: string): string {
  const text = normalizeUrl(raw);
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isPlausibleUrl(raw: string): boolean {
  const host = hostnameOf(raw);
  return host.includes(".") && /^[a-z0-9.-]+$/.test(host) && !host.startsWith(".") && !host.endsWith(".");
}

export function registrableDomain(host: string): string {
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  return TWO_PART_SUFFIX.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

function colorFor(text: string): string {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return `hsl(${hash % 360} 45% 42%)`;
}

function fromDomain(host: string): KnownSite | undefined {
  return KNOWN.find((site) => site.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)));
}

function fromName(name: string): KnownSite | undefined {
  const text = name.trim().toLowerCase();
  if (!text) return undefined;
  // Exact, or starting with the name and then something that is not a letter or digit ("Shopify 后台", "PayPal-主号").
  return KNOWN.find((site) => site.names.some((entry) => text === entry || (text.startsWith(entry) && !/[a-z0-9]/.test(text.charAt(entry.length)))));
}

export function siteFromApiKey(key: string): Site | undefined {
  const text = key.trim();
  const found = KNOWN.filter((site) => site.apiPrefixes?.some((prefix) => text.startsWith(prefix)))
    // the longest matching prefix wins ("sk-ant-" before "sk-")
    .sort((a, b) => Math.max(...b.apiPrefixes!.filter((p) => text.startsWith(p)).map((p) => p.length)) - Math.max(...a.apiPrefixes!.filter((p) => text.startsWith(p)).map((p) => p.length)))[0];
  return found && { key: found.key, name: found.name, color: found.color, letter: found.letter };
}

function plain(site: KnownSite): Site {
  return { key: site.key, name: site.name, color: site.color, letter: site.letter };
}

// Finds the site from, in order: an API key prefix, a web address, then the entry's own name or issuer.
export function detectSite(input: { url?: string; apiKey?: string; name?: string; issuer?: string }): Site {
  if (input.apiKey) {
    const byKey = siteFromApiKey(input.apiKey);
    if (byKey) return byKey;
  }
  const host = hostnameOf(input.url ?? "");
  if (host) {
    const known = fromDomain(host);
    if (known) return plain(known);
    const domain = registrableDomain(host);
    return { key: domain, name: domain, color: colorFor(domain), letter: domain.charAt(0).toUpperCase() };
  }
  for (const label of [input.issuer, input.name]) {
    if (!label) continue;
    const known = fromName(label);
    if (known) return plain(known);
  }
  const label = (input.issuer || input.name || "").trim();
  if (!label) return { key: "other", name: "其他", color: "#8a8a85", letter: "·" };
  const first = label.split(/[\s\-_·|｜:：]/)[0] || label;
  return { key: `name:${first.toLowerCase()}`, name: first, color: colorFor(first.toLowerCase()), letter: Array.from(first)[0].toUpperCase() };
}
