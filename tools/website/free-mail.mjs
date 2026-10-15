// Email domains that anyone can sign up at (free mail), so a company 话术 library is never bound to them or served for
// them (README.md「话术同步」). Used by api.mjs (GET /api/library never serves one) and sync.mjs (--link-domain refuses one).
// Only functions may be named exports of a Worker module (see worker.mjs), so the list stays private.

const freeMailDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "qq.com",
  "vip.qq.com",
  "foxmail.com",
  "163.com",
  "vip.163.com",
  "126.com",
  "vip.126.com",
  "yeah.net",
  "188.com",
  "sina.com",
  "sina.cn",
  "vip.sina.com",
  "sohu.com",
  "aliyun.com",
  "139.com",
  "189.cn",
  "wo.cn",
  "tom.com",
  "21cn.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "live.cn",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "yahoo.com",
  "yahoo.com.cn",
  "ymail.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.de",
  "mail.com",
  "yandex.com",
  "yandex.ru",
  "mail.ru",
  "zoho.com",
  "hey.com",
  "fastmail.com",
  "tutanota.com",
  "naver.com",
  "daum.net",
  "hanmail.net",
  "163.net",
  "hotmail.co.uk",
  "outlook.jp",
  "yahoo.co.jp",
  "copyboxx.com",
]);

// Country versions such as hotmail.fr, outlook.com.br or yahoo.co.uk: first label one of these, at most 3 labels.
const freeMailFamilies = new Set(["hotmail", "outlook", "yahoo", "live"]);

// Lower-case, trimmed domain, or null when it is not a plausible one: labels of letters, digits and hyphens (no hyphen
// at either end), at least one dot, a last label of at least 2 letters, at most 253 characters.
export function normalizeDomain(value) {
  if (typeof value !== "string") return null;
  const domain = value.trim().toLowerCase();
  if (!domain || domain.length > 253) return null;
  const labels = domain.split(".");
  if (labels.length < 2) return null;
  if (!labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  if (!/^[a-z]{2,}$/.test(labels.at(-1))) return null;
  return domain;
}

// True for a free-mail domain (exact list, or a hotmail / outlook / yahoo / live country version). Expects a domain;
// anything that does not normalize counts as free mail, so it is never bound or served.
export function isFreeMailDomain(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) return true;
  if (freeMailDomains.has(normalized)) return true;
  const labels = normalized.split(".");
  return labels.length <= 3 && freeMailFamilies.has(labels[0]);
}
