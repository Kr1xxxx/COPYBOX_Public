// One queue per storage key, shared by every store object opened on it. The panels, the example seeding and a backup
// restore each open their own store; with a queue per object, one's read-then-write could land between another's and
// silently drop its change. Here they all wait in the same line.
const queues = new WeakMap<object, Map<string, Promise<unknown>>>();
// Every task that is waiting or running, in any queue: quitting and restoring a backup wait for them (drainAll).
const unfinished = new Set<Promise<unknown>>();

export function serialFor(storage: object, key: string) {
  let byKey = queues.get(storage);
  if (!byKey) { byKey = new Map(); queues.set(storage, byKey); }
  const line = byKey;
  return function serial<T>(task: () => Promise<T>): Promise<T> {
    const previous = line.get(key) ?? Promise.resolve();
    const next = previous.then(task, task);
    const settled = next.catch(() => undefined);
    line.set(key, settled);
    unfinished.add(settled);
    void settled.then(() => unfinished.delete(settled));
    return next;
  };
}

// Resolves once every queue is empty, including tasks added while waiting. Never rejects.
export async function drainAll(): Promise<void> {
  while (unfinished.size > 0) await Promise.all(unfinished);
}
