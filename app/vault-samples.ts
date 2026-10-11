// A few clearly fake example entries, put into an EMPTY 保险箱 once so a new user can see what each type looks like.
// Never added when anything is already saved, never added twice, and one tap removes them all.
import type { TotpAccount } from "./totp-core.ts";
import { openSecretItemsStore, type VaultItem } from "./secret-items-store.ts";
import { openTotpStore } from "./totp-store.ts";

// v2: people who opened an earlier 保险箱 (flag v1) with data in it never got the examples; they get them once now.
export const SAMPLES_DONE_KEY = "clipbox.vault.samples.v2";
const PREFIX = "sample-";
export const isSampleId = (id: string) => id.startsWith(PREFIX);

export function sampleVaultData(now: number): { totp: TotpAccount[]; items: VaultItem[] } {
  const totp: TotpAccount[] = [{ id: `${PREFIX}totp`, issuer: "Example", name: "【范例】验证码", secret: "JBSWY3DPEHPK3PXP", digits: 6, period: 30, algorithm: "SHA1", createdAt: now }];
  const base = { createdAt: now, updatedAt: now };
  const items: VaultItem[] = [
    { id: `${PREFIX}login`, type: "login", name: "【范例】Example 后台", url: "https://example.com", username: "demo@example.com", password: "Example-Only-123", totpId: `${PREFIX}totp`, note: "这是范例，可以删除", ...base },
    { id: `${PREFIX}payment`, type: "payment", kind: "bank", name: "【范例】美元电汇", fields: { holder: "Example Trading Ltd", bank: "Example Bank", account: "GB82WEST12345698765432", swift: "DEUTDEFF", currency: "USD" }, ...base },
    { id: `${PREFIX}apikey`, type: "apikey", name: "【范例】接口密钥", service: "Example", key: "demo_key_0000000000EXAMPLE", secret: "", endpoint: "", expires: "", ...base },
    { id: `${PREFIX}recovery`, type: "recovery", name: "【范例】恢复码", site: "example.com", codes: ["0000-1111", "2222-3333", "4444-5555"], note: "", ...base },
  ];
  return { totp, items };
}

type SampleItem = { id: string; createdAt?: number; updatedAt?: number; type?: string; target?: string };

// A sample the user has edited is their data now: only untouched samples (still as created) may be cleared.
function untouched(entry: SampleItem) {
  return entry.updatedAt === undefined || entry.createdAt === undefined || entry.updatedAt === entry.createdAt;
}

// Which ids a clear may remove, found by the sample id mark only, never by guessing from the content.
export function planClearSamples(totp: SampleItem[], items: SampleItem[]) {
  const removeTotp = totp.filter((entry) => isSampleId(entry.id) && untouched(entry)).map((entry) => entry.id);
  const removeItems = items.filter((entry) => entry.type !== "mark" && isSampleId(entry.id) && untouched(entry)).map((entry) => entry.id);
  const keptEdited = items.filter((entry) => entry.type !== "mark" && isSampleId(entry.id) && !untouched(entry)).length;
  return { removeTotp, removeItems, keptEdited };
}

export function isMarkOfSample(target: string) {
  return target.slice(target.indexOf(":") + 1).startsWith(PREFIX);
}

// A restore only adds the samples whose ids are missing; whatever is there stays exactly as it is.
export function planRestoreSamples(totp: SampleItem[], items: SampleItem[], now: number) {
  const samples = sampleVaultData(now);
  const haveTotp = new Set(totp.map((entry) => entry.id));
  const haveItems = new Set(items.map((entry) => entry.id));
  return { addTotp: samples.totp.filter((entry) => !haveTotp.has(entry.id)), addItems: samples.items.filter((entry) => !haveItems.has(entry.id)) };
}

type Storage2 = Pick<Storage, "getItem" | "setItem">;

// The names of what a clear would remove right now (shown in the confirmation box).
export async function previewClearSamples(deviceKey: string, storage: Storage2 = localStorage): Promise<string[]> {
  const [totp, items] = [await openTotpStore(deviceKey, storage).list(), await openSecretItemsStore(deviceKey, storage).list()];
  const plan = planClearSamples(totp, items);
  const names = new Map<string, string>([...totp.map((entry) => [entry.id, `${entry.issuer ? `${entry.issuer} ` : ""}${entry.name}`.trim()] as [string, string]), ...items.map((item) => [item.id, "name" in item ? item.name : item.id] as [string, string])]);
  return [...plan.removeItems, ...plan.removeTotp].map((id) => names.get(id) ?? id);
}

// Removes the examples, and nothing else. There is no "remove all" path: each list is rewritten with only the planned ids
// taken out, and the write is refused unless exactly those entries are gone and every other one is left as it was.
export async function clearSampleEntries(deviceKey: string, storage: Storage2 = localStorage) {
  const totpStore = openTotpStore(deviceKey, storage);
  const itemStore = openSecretItemsStore(deviceKey, storage);
  const [totp, items] = [await totpStore.list(), await itemStore.list()];
  const plan = planClearSamples(totp, items);
  const goneItems = new Set(plan.removeItems);
  const goneTotp = new Set(plan.removeTotp);
  const keptItems = items.filter((item) => !goneItems.has(item.id));
  const keptTotp = totp.filter((entry) => !goneTotp.has(entry.id));
  // Marks (改归类) that only point at a removed example go with it.
  const finalItems = keptItems.filter((item) => !(item.type === "mark" && (goneItems.has(item.target.slice(item.target.indexOf(":") + 1)) || goneTotp.has(item.target.slice(item.target.indexOf(":") + 1)))));
  const safe = items.length - finalItems.length >= goneItems.size && finalItems.every((item) => items.includes(item) && !(isSampleId(item.id) && untouched(item) && item.type !== "mark"))
    && keptTotp.length === totp.length - goneTotp.size && goneItems.size + goneTotp.size <= 20;
  if (!safe) throw new Error("清除范例的检查没通过，数据没有改动");
  if (finalItems.length !== items.length) await itemStore.replaceAll(finalItems);
  if (keptTotp.length !== totp.length) await totpStore.replaceAll(keptTotp);
  storage.setItem(SAMPLES_DONE_KEY, "1");
  return { removed: goneItems.size + goneTotp.size, keptEdited: plan.keptEdited };
}

export async function restoreSampleEntries(deviceKey: string, storage: Storage2 = localStorage) {
  const totpStore = openTotpStore(deviceKey, storage);
  const itemStore = openSecretItemsStore(deviceKey, storage);
  const [totp, items] = [await totpStore.list(), await itemStore.list()];
  const plan = planRestoreSamples(totp, items, Date.now());
  if (plan.addItems.length > 0) await itemStore.replaceAll([...items, ...plan.addItems]);
  if (plan.addTotp.length > 0) await totpStore.replaceAll([...totp, ...plan.addTotp]);
  storage.setItem(SAMPLES_DONE_KEY, "1");
  return { added: plan.addItems.length + plan.addTotp.length };
}
