// A small in-memory IndexedDB for the backup code (app/data-transfer.ts, app/auto-backup.ts): open with an upgrade,
// databases(), and per store getAll / getAllKeys / get / put / delete / clear. Requests settle asynchronously and a
// transaction completes once they have, like the real thing. `dbs` exposes the contents: name → store → id → row.
export function fakeIndexedDB(seed = {}) {
  const dbs = new Map(Object.entries(seed).map(([name, stores]) => [name, new Map(Object.entries(stores).map(([s, rows]) => [s, new Map(rows.map((r) => [r.id, structuredClone(r)]))]))]));
  const later = (fn) => setTimeout(fn, 0);
  const storeNames = (stores) => Object.assign([...stores.keys()].sort(), { contains: (s) => stores.has(s) });
  return {
    dbs,
    databases: async () => [...dbs.keys()].map((name) => ({ name })),
    open(name) {
      const req = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      later(() => {
        const isNew = !dbs.has(name);
        if (isNew) dbs.set(name, new Map());
        const stores = dbs.get(name);
        req.result = {
          objectStoreNames: storeNames(stores),
          createObjectStore: (s) => void stores.set(s, new Map()),
          close() {},
          transaction() {
            const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
            let pending = 0;
            const settle = () => later(() => { if (pending === 0) tx.oncomplete?.(); });
            const ask = (run) => {
              pending += 1;
              const r = { result: undefined, error: null, onsuccess: null, onerror: null };
              later(() => { pending -= 1; r.result = run(); r.onsuccess?.(); settle(); });
              return r;
            };
            tx.objectStore = (s) => ({
              getAll: () => ask(() => [...stores.get(s).values()].map((r) => structuredClone(r))),
              getAllKeys: () => ask(() => [...stores.get(s).keys()]),
              get: (key) => ask(() => (stores.get(s).has(key) ? structuredClone(stores.get(s).get(key)) : undefined)),
              put: (row) => void stores.get(s).set(row.id, structuredClone(row)),
              delete: (key) => void stores.get(s).delete(key),
              clear: () => void stores.get(s).clear(),
            });
            settle();
            return tx;
          },
        };
        if (isNew) {
          req.onupgradeneeded?.();
          req.result.objectStoreNames = storeNames(stores);
        }
        req.onsuccess?.();
      });
      return req;
    },
  };
}

export function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
    snapshot: () => Object.fromEntries(map),
  };
}
