import assert from "node:assert/strict";
import test from "node:test";
import { groupBySite, matchesQuery, mergeSiteKeys } from "../app/account-view.ts";
import { detectSite } from "../app/site-core.ts";

const entry = (id, tab, title, site, hint = "") => ({ id, tab, title, hint, site, target: `${tab}:${id}`, autoTab: tab, autoSite: site });
const real = detectSite({ url: "https://example.com", name: "Example" });
const guess = detectSite({ name: "Example" });

test("a name-only guess joins the real domain of the same name", () => {
  const merged = mergeSiteKeys([entry("1", "login", "Example 后台", real), entry("2", "apikey", "Example API", guess)]);
  assert.equal(merged[0].site.key, merged[1].site.key);
  const groups = groupBySite([entry("1", "login", "Example 后台", real), entry("2", "apikey", "Example API", guess)]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].entries.length, 2);
});

test("a name that is itself the domain (a recovery code's site) joins it too", () => {
  const typed = detectSite({ name: "example.com" });
  assert.equal(mergeSiteKeys([entry("1", "login", "Example 后台", real), entry("2", "recovery", "恢复码", typed)])[1].site.key, real.key);
});

test("a guess with no matching domain stays on its own", () => {
  const lone = detectSite({ name: "Zeta" });
  assert.equal(mergeSiteKeys([entry("1", "login", "x", real), entry("2", "apikey", "y", lone)])[1].site.key, lone.key);
});

test("payment entries share one 收款 group, always last, never a website", () => {
  const other = { key: "other", name: "其他网站", color: "#888", letter: "·" };
  const groups = groupBySite([
    entry("1", "payment", "美元电汇", detectSite({ name: "PayPal" })),
    entry("2", "login", "杂项", other),
    entry("3", "login", "Example", real),
    entry("4", "payment", "收款信息", other),
  ]);
  assert.deepEqual(groups.map((group) => group.key), [real.key, "other", "payment"]);
  assert.equal(groups.at(-1).entries.length, 2);
  assert.equal(groups.at(-1).title, "收款信息");
});

test("search looks at title, website and hint", () => {
  const item = entry("1", "login", "Shopify 后台", detectSite({ url: "shopify.com" }), "ops@shop.com");
  assert.ok(matchesQuery(item, "shopify"));
  assert.ok(matchesQuery(item, "OPS@"));
  assert.ok(matchesQuery(item, " "));
  assert.ok(!matchesQuery(item, "paypal"));
});
