import assert from "node:assert/strict";
import test from "node:test";
import { addressBlock, addressHint, normalizeAddressFields, validateAddress } from "../app/address-core.ts";
import { groupBySite, matchesQuery } from "../app/account-view.ts";
import { withoutSecrets } from "../app/cloud-sync-core.ts";

const item = { name: "广州某某贸易有限公司", fields: { contact: "张三", phone: "138 0000 0000", address: "广州市天河区\n某某路 1 号", note: "只收工作日" } };

test("地址: one click copies company, contact with phone, then the address; 备注 stays out", () => {
  assert.equal(addressBlock(item), "广州某某贸易有限公司\n张三 138 0000 0000\n广州市天河区\n某某路 1 号");
  assert.equal(addressBlock({ name: "公司", fields: { address: "某地" } }), "公司\n某地");
  assert.equal(addressHint(item), "广州市天河区 某某路 1 号");
});

test("地址: company name and address are needed; one-line parts lose their line breaks", () => {
  assert.deepEqual(Object.keys(validateAddress(" ", {})).sort(), ["address", "name"]);
  assert.deepEqual(validateAddress("公司", { address: "某地" }), {});
  assert.match(validateAddress("公司", { address: "x".repeat(301) }).address, /太长/);
  assert.deepEqual(normalizeAddressFields({ contact: " 张三\n李四 ", address: " a\nb " }), { contact: "张三 李四", phone: "", address: "a\nb", note: "" });
});

test("地址 entries share one card next to 收款信息, are found by any part, and sync whole (nothing secret)", () => {
  const site = { key: "other", name: "其他网站", color: "#888", letter: "·" };
  const entry = (id, tab, search = "") => ({ id, tab, title: id, hint: "", search, site, target: `${tab}:${id}`, autoTab: tab, autoSite: site });
  const groups = groupBySite([entry("p", "payment"), entry("a", "address", "张三 广州"), entry("l", "login"), entry("b", "address")]);
  assert.deepEqual(groups.map((group) => group.key), ["other", "address", "payment"]);
  assert.equal(groups[1].title, "地址");
  assert.ok(matchesQuery(entry("a", "address", "张三 广州"), "广州"));
  const stored = { id: "1", type: "address", ...item, createdAt: 1, updatedAt: 1 };
  assert.deepEqual(withoutSecrets(stored), stored);
});
