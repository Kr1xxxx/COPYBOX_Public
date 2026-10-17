// Restoring a backup replaces the stored data, including the device key and the vault's salt, and then reloads the
// page. A save from the page that lands after that (a delayed copy count, a retry, an outside command) would encrypt
// the OLD data with the OLD key over the restored data, and the next start could not open it. So before a restore
// writes anything, every pending save is finished and the gate closes: from then on the vault, 账号 and image stores
// refuse to write until the page reloads (or the restore fails and puts the old data back, see reopenWrites).
import { waitForImageWrites } from "./image-store.ts";
import { drainAll } from "./store-queue.ts";

type QuiesceHook = () => Promise<unknown> | unknown;

const hooks = new Set<QuiesceHook>();
let closed = false;

export class WritesClosedError extends Error {
  constructor() {
    super("正在从备份恢复，这次改动没有保存");
    this.name = "WritesClosedError";
  }
}

/** The page registers what must be saved before a restore (its delayed writer and save queue). Returns the remover. */
export function onQuiesce(hook: QuiesceHook): () => void {
  hooks.add(hook);
  return () => { hooks.delete(hook); };
}

/** Finishes every pending save, then closes the gate. A hook that fails does not stop it: the gate is what keeps the restore safe. */
export async function quiesceWrites(): Promise<void> {
  await Promise.allSettled([...hooks].map(async (hook) => hook()));
  await drainAll();
  await waitForImageWrites();
  closed = true;
}

/** The restore did not happen (the old data is back as it was): saving is allowed again. */
export function reopenWrites() {
  closed = false;
}

export function writesClosed() {
  return closed;
}

/** Call right before writing to storage, with no await in between. */
export function assertWritesOpen() {
  if (closed) throw new WritesClosedError();
}
