// A few clearly fake example entries, put into an EMPTY 保险箱 once so a new user can see what each type looks like.
// Never added when anything is already saved, never added twice, and one tap removes them all.
import type { TotpAccount } from "./totp-core.ts";
import { openSecretItemsStore, type VaultItem } from "./secret-items-store.ts";
import { openTotpStore } from "./totp-store.ts";

export const SAMPLES_DONE_KEY = "clipbox.vault.samples.v1";
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

export async function clearSampleEntries(deviceKey: string) {
  const totpStore = openTotpStore(deviceKey);
  const itemStore = openSecretItemsStore(deviceKey);
  const [totp, items] = [await totpStore.list(), await itemStore.list()];
  const plan = planClearSamples(totp, items);
  const gone = new Set([...plan.removeItems, ...plan.removeTotp]);
  if (plan.removeItems.length > 0 || items.some((item) => item.type === "mark" && isMarkOfSample(item.target) && gone.has(item.target.slice(item.target.indexOf(":") + 1)))) {
    await itemStore.replaceAll(items.filter((item) => !gone.has(item.id) && !(item.type === "mark" && gone.has(item.target.slice(item.target.indexOf(":") + 1)))));
  }
  if (plan.removeTotp.length > 0) await totpStore.replaceAll(totp.filter((entry) => !gone.has(entry.id)));
  localStorage.setItem(SAMPLES_DONE_KEY, "1");
  return { removed: plan.removeItems.length + plan.removeTotp.length, keptEdited: plan.keptEdited };
}

export async function restoreSampleEntries(deviceKey: string) {
  const totpStore = openTotpStore(deviceKey);
  const itemStore = openSecretItemsStore(deviceKey);
  const [totp, items] = [await totpStore.list(), await itemStore.list()];
  const plan = planRestoreSamples(totp, items, Date.now());
  if (plan.addItems.length > 0) await itemStore.replaceAll([...items, ...plan.addItems]);
  if (plan.addTotp.length > 0) await totpStore.replaceAll([...totp, ...plan.addTotp]);
  localStorage.setItem(SAMPLES_DONE_KEY, "1");
  return { added: plan.addItems.length + plan.addTotp.length };
}
