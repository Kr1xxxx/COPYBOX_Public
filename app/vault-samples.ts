// A few clearly fake example entries, put into an EMPTY 保险箱 once so a new user can see what each type looks like.
// Never added when anything is already saved, never added twice, and one tap removes them all.
import type { TotpAccount } from "./totp-core.ts";
import { openSecretItemsStore, type VaultItem } from "./secret-items-store.ts";
import { openTotpStore } from "./totp-store.ts";

// v2: people who opened an earlier 保险箱 (flag v1) with data in it never got the examples; they get them once now.
export const SAMPLES_DONE_KEY = "clipbox.vault.samples.v2";
const PREFIX = "sample-";
export const isSampleId = (id: string) => id.startsWith(PREFIX);

// `hiddenKinds`: item types the platform has no category for; their 范例 are left out (the 验证码 stays, every platform has it).
export function sampleVaultData(now: number, hiddenKinds: string[] = []): { totp: TotpAccount[]; items: VaultItem[] } {
  const totp: TotpAccount[] = [{ id: `${PREFIX}totp`, issuer: "Example", name: "【范例】验证码", secret: "JBSWY3DPEHPK3PXP", digits: 6, period: 30, algorithm: "SHA1", createdAt: now }];
  const base = { createdAt: now, updatedAt: now };
  const items: VaultItem[] = [
    { id: `${PREFIX}login`, type: "login", name: "【范例】Example 后台", url: "https://example.com", username: "demo@example.com", password: "Example-Only-123", totpId: `${PREFIX}totp`, note: "这是范例，可以删除", ...base },
    { id: `${PREFIX}payment`, type: "payment", kind: "bank", name: "【范例】美元电汇", fields: { holder: "Example Trading Ltd", bank: "Example Bank", account: "GB82WEST12345698765432", swift: "DEUTDEFF", currency: "USD" }, ...base },
    { id: `${PREFIX}apikey`, type: "apikey", name: "【范例】接口密钥", service: "Example", key: "demo_key_0000000000EXAMPLE", secret: "", endpoint: "", expires: "", ...base },
    { id: `${PREFIX}recovery`, type: "recovery", name: "【范例】恢复码", site: "example.com", codes: ["0000-1111", "2222-3333", "4444-5555"], note: "", ...base },
  ];
  return { totp, items: items.filter((item) => !hiddenKinds.includes(item.type)) };
}

type SampleItem = { id: string; createdAt?: number; updatedAt?: number; type?: string; target?: string };

// A sample the user has edited is their data now: only untouched samples (still as created) may be cleared.
function untouched(entry: SampleItem) {
  return entry.updatedAt === undefined || entry.createdAt === undefined || entry.updatedAt === entry.createdAt;
}

// Which ids a clear may remove, found by the sample id mark only, never by guessing from the content.
// `onlyKinds` limits it to items of those types (the 范例 of kinds this platform has no category for).
export function planClearSamples(totp: SampleItem[], items: SampleItem[], onlyKinds?: string[]) {
  const ofKind = (entry: SampleItem) => entry.type !== "mark" && isSampleId(entry.id) && (!onlyKinds || onlyKinds.includes(entry.type ?? ""));
  const removeTotp = onlyKinds ? [] : totp.filter((entry) => isSampleId(entry.id) && untouched(entry)).map((entry) => entry.id);
  const removeItems = items.filter((entry) => ofKind(entry) && untouched(entry)).map((entry) => entry.id);
  const keptEdited = items.filter((entry) => ofKind(entry) && !untouched(entry)).length;
  return { removeTotp, removeItems, keptEdited };
}

// A restore only adds the samples whose ids are missing; whatever is there stays exactly as it is.
export function planRestoreSamples(totp: SampleItem[], items: SampleItem[], now: number, hiddenKinds: string[] = []) {
  const samples = sampleVaultData(now, hiddenKinds);
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
// Each list is read and rewritten in one step (store.update), so an entry saved at the same moment is never lost.
export async function clearSampleEntries(deviceKey: string, storage: Storage2 = localStorage, onlyKinds?: string[]) {
  const totpStore = openTotpStore(deviceKey, storage);
  const itemStore = openSecretItemsStore(deviceKey, storage);
  let removedTotp: string[] = [];
  if (!onlyKinds) await totpStore.update((totp) => {
    removedTotp = planClearSamples(totp, []).removeTotp;
    const gone = new Set(removedTotp);
    const kept = totp.filter((entry) => !gone.has(entry.id));
    if (kept.length !== totp.length - gone.size || gone.size > 20) throw new Error("清除范例的检查没通过，数据没有改动");
    return kept;
  });
  let removedItems = 0;
  let keptEdited = 0;
  await itemStore.update((items) => {
    const plan = planClearSamples([], items, onlyKinds);
    const goneItems = new Set(plan.removeItems);
    if (goneItems.size === 0 && removedTotp.length === 0) { keptEdited = plan.keptEdited; return items; }
    const goneTotp = new Set(removedTotp);
    // Marks (改归类) that only point at a removed example go with it.
    const finalItems = items.filter((item) => !goneItems.has(item.id) && !(item.type === "mark" && (goneItems.has(item.target.slice(item.target.indexOf(":") + 1)) || goneTotp.has(item.target.slice(item.target.indexOf(":") + 1)))));
    const safe = items.length - finalItems.length >= goneItems.size && finalItems.every((item) => items.includes(item) && !(isSampleId(item.id) && untouched(item) && item.type !== "mark" && (!onlyKinds || onlyKinds.includes(item.type)))) && goneItems.size <= 20;
    if (!safe) throw new Error("清除范例的检查没通过，数据没有改动");
    removedItems = goneItems.size;
    keptEdited = plan.keptEdited;
    return finalItems;
  });
  storage.setItem(SAMPLES_DONE_KEY, "1");
  return { removed: removedItems + removedTotp.length, keptEdited };
}

export async function restoreSampleEntries(deviceKey: string, storage: Storage2 = localStorage, hiddenKinds: string[] = []) {
  const totpStore = openTotpStore(deviceKey, storage);
  const itemStore = openSecretItemsStore(deviceKey, storage);
  const now = Date.now();
  let added = 0;
  await itemStore.update((items) => {
    const { addItems } = planRestoreSamples([], items, now, hiddenKinds);
    added += addItems.length;
    return addItems.length > 0 ? [...items, ...addItems] : items;
  });
  await totpStore.update((totp) => {
    const { addTotp } = planRestoreSamples(totp, [], now);
    added += addTotp.length;
    return addTotp.length > 0 ? [...totp, ...addTotp] : totp;
  });
  storage.setItem(SAMPLES_DONE_KEY, "1");
  return { added };
}
