// A small in-memory IndexedDB for unit tests: open (with upgrade), transactions over one or more stores, and the
// store calls the app makes (get, getAll, put, delete, clear, count). Events fire asynchronously like the real thing;
// a transaction completes once all of its requests have settled.
export function memoryIndexedDB() {
  const dbs = new Map();
  const later = (fn) => setTimeout(fn, 0);

  function storeNames(stores) {
    return Object.assign([...stores.keys()], { contains: (name) => stores.has(name) });
  }

  function connection(name) {
    const stores = dbs.get(name);
    return {
      get objectStoreNames() { return storeNames(stores); },
      createObjectStore: (store) => void stores.set(store, new Map()),
      close() {},
      transaction() {
        const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
        let pending = 0;
        const settle = () => later(() => { if (pending === 0) tx.oncomplete?.(); });
        const request = (run) => {
          const req = { result: undefined, error: null, onsuccess: null, onerror: null };
          pending += 1;
          later(() => {
            pending -= 1;
            try { req.result = run(); req.onsuccess?.({ target: req }); } catch (error) { req.error = error; req.onerror?.(); }
            settle();
          });
          return req;
        };
        tx.objectStore = (store) => {
          const rows = stores.get(store);
          return {
            get: (id) => request(() => structuredClone(rows.get(id))),
            getAll: () => request(() => [...rows.values()].map((row) => structuredClone(row))),
            count: () => request(() => rows.size),
            put: (row) => request(() => void rows.set(row.id, structuredClone(row))),
            delete: (id) => request(() => void rows.delete(id)),
            clear: () => request(() => void rows.clear()),
          };
        };
        settle();
        return tx;
      },
    };
  }

  return {
    dbs,
    databases: async () => [...dbs.keys()].map((name) => ({ name })),
    open(name) {
      const req = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      later(() => {
        const isNew = !dbs.has(name);
        if (isNew) dbs.set(name, new Map());
        req.result = connection(name);
        if (isNew) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}

export function memoryStorage(initial = {}) {
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
