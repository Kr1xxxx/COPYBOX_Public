// Which website or service a 保险箱 entry belongs to, and how its round badge looks (Mac only). Pure functions.
// No network here: the badge is a coloured circle with the site's initial, or the bundled brand glyph when we have one (site-icons.ts).

export type Site = { key: string; name: string; color: string; letter: string };

type KnownSite = Site & { domains: string[]; names: string[]; apiPrefixes?: string[] };

const KNOWN: KnownSite[] = [
  // Names are checked in order, so a more specific name comes first (阿里云 before 阿里).
  { key: "gmail", name: "Gmail", color: "#EA4335", letter: "G", domains: ["gmail.com", "googlemail.com", "mail.google.com"], names: ["gmail", "谷歌邮箱"] },
  { key: "youtube", name: "YouTube", color: "#FF0000", letter: "Y", domains: ["youtube.com", "youtu.be"], names: ["youtube", "油管"] },
  { key: "instagram", name: "Instagram", color: "#FF0069", letter: "I", domains: ["instagram.com"], names: ["instagram", "ins", "ig"] },
  { key: "whatsapp", name: "WhatsApp", color: "#25D366", letter: "W", domains: ["whatsapp.com", "wa.me"], names: ["whatsapp", "whats app"] },
  { key: "facebook", name: "Facebook", color: "#0866FF", letter: "f", domains: ["facebook.com", "fb.com"], names: ["facebook", "脸书", "臉書"] },
  { key: "messenger", name: "Messenger", color: "#0866FF", letter: "M", domains: ["messenger.com"], names: ["messenger"] },
  { key: "threads", name: "Threads", color: "#000000", letter: "@", domains: ["threads.net", "threads.com"], names: ["threads"] },
  { key: "twitter", name: "X", color: "#000000", letter: "X", domains: ["x.com", "twitter.com"], names: ["twitter", "推特"] },
  { key: "linkedin", name: "LinkedIn", color: "#0A66C2", letter: "in", domains: ["linkedin.com"], names: ["linkedin", "领英", "領英"] },
  { key: "outlook", name: "Outlook", color: "#0078D4", letter: "O", domains: ["outlook.com", "outlook.live.com", "outlook.office.com", "hotmail.com"], names: ["outlook", "hotmail"] },
  { key: "aliexpress", name: "速卖通", color: "#FF4747", letter: "速", domains: ["aliexpress.com", "aliexpress.us"], names: ["aliexpress", "速卖通", "速賣通"] },
  { key: "alibabacloud", name: "阿里云", color: "#FF6A00", letter: "云", domains: ["alibabacloud.com", "aliyun.com"], names: ["alibabacloud", "阿里云", "阿里雲", "aliyun"] },
  { key: "walmart", name: "Walmart", color: "#0071CE", letter: "W", domains: ["walmart.com"], names: ["walmart", "沃尔玛"] },
  { key: "canva", name: "Canva", color: "#00C4CC", letter: "C", domains: ["canva.com", "canva.cn"], names: ["canva", "可画"] },
  { key: "adobe", name: "Adobe", color: "#FF0000", letter: "A", domains: ["adobe.com"], names: ["adobe"] },
  { key: "salesforce", name: "Salesforce", color: "#00A1E0", letter: "S", domains: ["salesforce.com", "force.com"], names: ["salesforce"] },
  { key: "zoom", name: "Zoom", color: "#0B5CFF", letter: "Z", domains: ["zoom.us", "zoom.com"], names: ["zoom"] },
  { key: "figma", name: "Figma", color: "#F24E1E", letter: "F", domains: ["figma.com"], names: ["figma"] },
  { key: "baidu", name: "百度", color: "#2932E1", letter: "百", domains: ["baidu.com"], names: ["baidu", "百度"] },
  { key: "qq", name: "QQ", color: "#1EBAFC", letter: "Q", domains: ["qq.com"], names: ["qq", "qq邮箱"] },
  { key: "weibo", name: "微博", color: "#E6162D", letter: "微", domains: ["weibo.com", "weibo.cn"], names: ["weibo", "微博"] },
  { key: "xiaohongshu", name: "小红书", color: "#FF2442", letter: "小", domains: ["xiaohongshu.com", "xhslink.com"], names: ["xiaohongshu", "小红书", "小紅書"] },
  { key: "bilibili", name: "哔哩哔哩", color: "#00A1D6", letter: "B", domains: ["bilibili.com", "b23.tv"], names: ["bilibili", "哔哩哔哩", "b站"] },
  { key: "kuaishou", name: "快手", color: "#FF4906", letter: "快", domains: ["kuaishou.com"], names: ["kuaishou", "快手"] },
  { key: "huawei", name: "华为", color: "#FF0000", letter: "华", domains: ["huawei.com", "huaweicloud.com"], names: ["huawei", "华为", "華為"] },
  { key: "xiaomi", name: "小米", color: "#FF6900", letter: "米", domains: ["mi.com", "xiaomi.com"], names: ["xiaomi", "小米"] },
  { key: "line", name: "LINE", color: "#00C300", letter: "L", domains: ["line.me"], names: ["line"] },
  { key: "viber", name: "Viber", color: "#7360F2", letter: "V", domains: ["viber.com"], names: ["viber"] },
  { key: "snapchat", name: "Snapchat", color: "#FFFC00", letter: "S", domains: ["snapchat.com"], names: ["snapchat"] },
  { key: "zalo", name: "Zalo", color: "#0068FF", letter: "Z", domains: ["zalo.me"], names: ["zalo"] },
  { key: "kakaotalk", name: "KakaoTalk", color: "#FFCD00", letter: "K", domains: ["kakao.com", "kakaocorp.com"], names: ["kakaotalk", "kakao"] },
  { key: "naver", name: "Naver", color: "#03C75A", letter: "N", domains: ["naver.com"], names: ["naver"] },
  { key: "wix", name: "Wix", color: "#0C6EFC", letter: "W", domains: ["wix.com"], names: ["wix"] },
  { key: "wordpress", name: "WordPress", color: "#21759B", letter: "W", domains: ["wordpress.com", "wordpress.org"], names: ["wordpress"] },
  { key: "squarespace", name: "Squarespace", color: "#000000", letter: "S", domains: ["squarespace.com"], names: ["squarespace"] },
  { key: "woocommerce", name: "WooCommerce", color: "#96588A", letter: "W", domains: ["woocommerce.com"], names: ["woocommerce"] },
  { key: "bigcommerce", name: "BigCommerce", color: "#121118", letter: "B", domains: ["bigcommerce.com"], names: ["bigcommerce"] },
  { key: "hostinger", name: "Hostinger", color: "#673DE6", letter: "H", domains: ["hostinger.com"], names: ["hostinger"] },
  { key: "namesilo", name: "NameSilo", color: "#031B4E", letter: "N", domains: ["namesilo.com"], names: ["namesilo"] },
  { key: "porkbun", name: "Porkbun", color: "#EF7878", letter: "P", domains: ["porkbun.com"], names: ["porkbun"] },
  { key: "digitalocean", name: "DigitalOcean", color: "#0080FF", letter: "D", domains: ["digitalocean.com"], names: ["digitalocean"] },
  { key: "hetzner", name: "Hetzner", color: "#D50C2D", letter: "H", domains: ["hetzner.com", "hetzner.cloud"], names: ["hetzner"] },
  { key: "vercel", name: "Vercel", color: "#000000", letter: "V", domains: ["vercel.com"], names: ["vercel"] },
  { key: "netlify", name: "Netlify", color: "#00C7B7", letter: "N", domains: ["netlify.com", "netlify.app"], names: ["netlify"] },
  { key: "gitlab", name: "GitLab", color: "#FC6D26", letter: "G", domains: ["gitlab.com"], names: ["gitlab"] },
  { key: "atlassian", name: "Atlassian", color: "#0052CC", letter: "A", domains: ["atlassian.com", "atlassian.net", "bitbucket.org"], names: ["atlassian", "jira", "confluence", "bitbucket"] },
  { key: "trello", name: "Trello", color: "#0052CC", letter: "T", domains: ["trello.com"], names: ["trello"] },
  { key: "asana", name: "Asana", color: "#F06A6A", letter: "A", domains: ["asana.com"], names: ["asana"] },
  { key: "airtable", name: "Airtable", color: "#18BFFF", letter: "A", domains: ["airtable.com"], names: ["airtable"] },
  { key: "miro", name: "Miro", color: "#050038", letter: "M", domains: ["miro.com"], names: ["miro"] },
  { key: "calendly", name: "Calendly", color: "#006BFF", letter: "C", domains: ["calendly.com"], names: ["calendly"] },
  { key: "hubspot", name: "HubSpot", color: "#FF7A59", letter: "H", domains: ["hubspot.com"], names: ["hubspot"] },
  { key: "zendesk", name: "Zendesk", color: "#03363D", letter: "Z", domains: ["zendesk.com"], names: ["zendesk"] },
  { key: "mailgun", name: "Mailgun", color: "#F06B66", letter: "M", domains: ["mailgun.com"], names: ["mailgun"] },
  { key: "deepl", name: "DeepL", color: "#0F2B46", letter: "D", domains: ["deepl.com"], names: ["deepl"] },
  { key: "onepassword", name: "1Password", color: "#145FE4", letter: "1", domains: ["1password.com"], names: ["1password", "onepassword"] },
  { key: "bitwarden", name: "Bitwarden", color: "#175DDC", letter: "B", domains: ["bitwarden.com"], names: ["bitwarden"] },
  { key: "lastpass", name: "LastPass", color: "#D32D27", letter: "L", domains: ["lastpass.com"], names: ["lastpass"] },
  { key: "proton", name: "Proton", color: "#6D4AFF", letter: "P", domains: ["proton.me", "protonmail.com"], names: ["proton", "protonmail"] },
  { key: "icloud", name: "iCloud", color: "#3693F3", letter: "i", domains: ["icloud.com"], names: ["icloud"] },
  { key: "spotify", name: "Spotify", color: "#1ED760", letter: "S", domains: ["spotify.com"], names: ["spotify"] },
  { key: "netflix", name: "Netflix", color: "#E50914", letter: "N", domains: ["netflix.com"], names: ["netflix"] },
  { key: "twitch", name: "Twitch", color: "#9146FF", letter: "T", domains: ["twitch.tv"], names: ["twitch"] },
  { key: "steam", name: "Steam", color: "#000000", letter: "S", domains: ["steampowered.com", "steamcommunity.com"], names: ["steam"] },
  { key: "tumblr", name: "Tumblr", color: "#36465D", letter: "t", domains: ["tumblr.com"], names: ["tumblr"] },
  { key: "quora", name: "Quora", color: "#B92B27", letter: "Q", domains: ["quora.com"], names: ["quora"] },
  { key: "medium", name: "Medium", color: "#000000", letter: "M", domains: ["medium.com"], names: ["medium"] },
  { key: "substack", name: "Substack", color: "#FF6719", letter: "S", domains: ["substack.com"], names: ["substack"] },
  { key: "patreon", name: "Patreon", color: "#000000", letter: "P", domains: ["patreon.com"], names: ["patreon"] },
  { key: "gumroad", name: "Gumroad", color: "#FF90E8", letter: "G", domains: ["gumroad.com"], names: ["gumroad"] },
  { key: "paddle", name: "Paddle", color: "#FDDD35", letter: "P", domains: ["paddle.com"], names: ["paddle"] },
  { key: "upwork", name: "Upwork", color: "#6FDA44", letter: "U", domains: ["upwork.com"], names: ["upwork"] },
  { key: "fiverr", name: "Fiverr", color: "#1DBF73", letter: "F", domains: ["fiverr.com"], names: ["fiverr"] },
  { key: "payoneer", name: "Payoneer", color: "#FF4800", letter: "P", domains: ["payoneer.com"], names: ["payoneer", "派安盈"] },
  { key: "westernunion", name: "西联汇款", color: "#FFDD00", letter: "W", domains: ["westernunion.com"], names: ["westernunion", "western union", "西联", "西聯"] },
  { key: "revolut", name: "Revolut", color: "#191C1F", letter: "R", domains: ["revolut.com"], names: ["revolut"] },
  { key: "klarna", name: "Klarna", color: "#FFB3C7", letter: "K", domains: ["klarna.com"], names: ["klarna"] },
  { key: "square", name: "Square", color: "#3E4348", letter: "S", domains: ["squareup.com"], names: ["square"] },
  { key: "xero", name: "Xero", color: "#13B5EA", letter: "X", domains: ["xero.com"], names: ["xero"] },
  { key: "quickbooks", name: "QuickBooks", color: "#2CA01C", letter: "Q", domains: ["quickbooks.intuit.com", "quickbooks.com"], names: ["quickbooks"] },
  { key: "visa", name: "Visa", color: "#1A1F71", letter: "V", domains: ["visa.com"], names: ["visa"] },
  { key: "mastercard", name: "Mastercard", color: "#EB001B", letter: "M", domains: ["mastercard.com"], names: ["mastercard", "万事达"] },
  { key: "amex", name: "American Express", color: "#2E77BC", letter: "A", domains: ["americanexpress.com"], names: ["amex", "american express", "美国运通"] },
  { key: "usps", name: "USPS", color: "#333366", letter: "U", domains: ["usps.com"], names: ["usps"] },
  { key: "airbnb", name: "Airbnb", color: "#FF5A5F", letter: "A", domains: ["airbnb.com"], names: ["airbnb", "爱彼迎"] },
  { key: "uber", name: "Uber", color: "#000000", letter: "U", domains: ["uber.com"], names: ["uber"] },
  { key: "grab", name: "Grab", color: "#00B14F", letter: "G", domains: ["grab.com"], names: ["grab"] },
  { key: "amazon", name: "Amazon", color: "#ff9900", letter: "a", domains: ["amazon.com", "amazon.co.uk", "amazon.de", "amazon.co.jp", "amazon.ca", "amazonaws.com", "aws.amazon.com"], names: ["amazon", "亚马逊", "亞馬遜"] },
  { key: "shopify", name: "Shopify", color: "#5a863e", letter: "S", domains: ["shopify.com", "myshopify.com"], names: ["shopify"], apiPrefixes: ["shpat_", "shpss_", "shpca_"] },
  { key: "paypal", name: "PayPal", color: "#003087", letter: "P", domains: ["paypal.com", "paypal.me"], names: ["paypal"] },
  { key: "wise", name: "Wise", color: "#2f7d32", letter: "W", domains: ["wise.com", "transferwise.com"], names: ["wise", "transferwise"] },
  { key: "google", name: "Google", color: "#4285f4", letter: "G", domains: ["google.com", "googleapis.com"], names: ["google", "谷歌", "骨骼"], apiPrefixes: ["AIza", "ya29."] },
  { key: "alibaba", name: "阿里巴巴", color: "#ff6a00", letter: "阿", domains: ["alibaba.com", "1688.com"], names: ["alibaba", "阿里", "阿里巴巴", "阿里国际站", "阿里國際站", "1688"] },
  { key: "dhl", name: "DHL", color: "#d40511", letter: "D", domains: ["dhl.com"], names: ["dhl"] },
  { key: "fedex", name: "FedEx", color: "#4d148c", letter: "F", domains: ["fedex.com"], names: ["fedex"] },
  { key: "ups", name: "UPS", color: "#351c15", letter: "U", domains: ["ups.com"], names: ["ups"] },
  { key: "openai", name: "OpenAI", color: "#10a37f", letter: "O", domains: ["openai.com", "chatgpt.com"], names: ["openai", "chatgpt"], apiPrefixes: ["sk-proj-", "sk-"] },
  { key: "anthropic", name: "Anthropic", color: "#d97757", letter: "A", domains: ["anthropic.com", "claude.ai"], names: ["anthropic", "claude"], apiPrefixes: ["sk-ant-"] },
  { key: "github", name: "GitHub", color: "#24292f", letter: "G", domains: ["github.com"], names: ["github"], apiPrefixes: ["ghp_", "github_pat_", "gho_"] },
  { key: "meta", name: "Meta", color: "#1877f2", letter: "M", domains: ["meta.com", "business.facebook.com"], names: ["meta"] },
  { key: "microsoft", name: "Microsoft", color: "#00a4ef", letter: "M", domains: ["microsoft.com", "office.com", "live.com", "microsoftonline.com", "azure.com"], names: ["microsoft", "微软", "office"] },
  { key: "stripe", name: "Stripe", color: "#635bff", letter: "S", domains: ["stripe.com"], names: ["stripe"], apiPrefixes: ["sk_live_", "sk_test_", "pk_live_", "pk_test_", "rk_live_"] },
  { key: "slack", name: "Slack", color: "#4a154b", letter: "S", domains: ["slack.com"], names: ["slack"], apiPrefixes: ["xoxb-", "xoxp-", "xapp-"] },
  { key: "tiktok", name: "TikTok", color: "#000000", letter: "T", domains: ["tiktok.com"], names: ["tiktok", "抖音"] },
  { key: "ebay", name: "eBay", color: "#E53238", letter: "e", domains: ["ebay.com", "ebay.co.uk"], names: ["ebay"] },
  { key: "etsy", name: "Etsy", color: "#F16521", letter: "E", domains: ["etsy.com"], names: ["etsy"] },
  { key: "alipay", name: "支付宝", color: "#1677FF", letter: "支", domains: ["alipay.com"], names: ["alipay", "支付宝"] },
  { key: "wechat", name: "微信", color: "#07C160", letter: "微", domains: ["wechat.com", "weixin.qq.com", "wx.qq.com"], names: ["wechat", "微信"] },
  { key: "taobao", name: "淘宝", color: "#E94F20", letter: "淘", domains: ["taobao.com", "tmall.com"], names: ["taobao", "淘宝", "天猫"] },
  { key: "cloudflare", name: "Cloudflare", color: "#F38020", letter: "C", domains: ["cloudflare.com"], names: ["cloudflare"] },
  { key: "godaddy", name: "GoDaddy", color: "#1BDBDB", letter: "G", domains: ["godaddy.com"], names: ["godaddy"] },
  { key: "namecheap", name: "Namecheap", color: "#DE3723", letter: "N", domains: ["namecheap.com"], names: ["namecheap"] },
  { key: "mailchimp", name: "Mailchimp", color: "#FFE01B", letter: "M", domains: ["mailchimp.com"], names: ["mailchimp"] },
  { key: "notion", name: "Notion", color: "#000000", letter: "N", domains: ["notion.so", "notion.com"], names: ["notion"] },
  { key: "dropbox", name: "Dropbox", color: "#0061FF", letter: "D", domains: ["dropbox.com"], names: ["dropbox"] },
  { key: "apple", name: "Apple", color: "#000000", letter: "A", domains: ["apple.com", "icloud.com"], names: ["apple", "icloud"] },
  { key: "shopee", name: "Shopee", color: "#EE4D2D", letter: "S", domains: ["shopee.com", "shopee.sg", "shopee.tw"], names: ["shopee", "虾皮", "蝦皮"] },
  { key: "zoho", name: "Zoho", color: "#E42527", letter: "Z", domains: ["zoho.com"], names: ["zoho"] },
  { key: "telegram", name: "Telegram", color: "#26A5E4", letter: "T", domains: ["telegram.org", "t.me"], names: ["telegram"] },
  { key: "discord", name: "Discord", color: "#5865F2", letter: "D", domains: ["discord.com"], names: ["discord"] },
  { key: "reddit", name: "Reddit", color: "#FF4500", letter: "R", domains: ["reddit.com"], names: ["reddit"] },
  { key: "pinterest", name: "Pinterest", color: "#BD081C", letter: "P", domains: ["pinterest.com"], names: ["pinterest"] },
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

// The longest matching domain wins, so mail.google.com is Gmail (not Google) and weixin.qq.com is 微信 (not QQ).
function fromDomain(host: string): KnownSite | undefined {
  let found: KnownSite | undefined;
  let length = 0;
  for (const site of KNOWN) {
    for (const domain of site.domains) {
      if (domain.length > length && (host === domain || host.endsWith(`.${domain}`))) { found = site; length = domain.length; }
    }
  }
  return found;
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

// A payment entry belongs to its service when the kind says so (PayPal, Wise) or its name names a known site;
// otherwise it is one shared 收款 group, never a group made from the first word of its title.
export function paymentSite(kind: string, name: string): Site {
  if (kind === "paypal") return detectSite({ name: "PayPal" });
  if (kind === "wise") return detectSite({ name: "Wise" });
  const found = detectSite({ name });
  return found.key.startsWith("name:") || found.key === "other" ? { key: "payment", name: "收款信息", color: "#4a7a68", letter: "收" } : found;
}
