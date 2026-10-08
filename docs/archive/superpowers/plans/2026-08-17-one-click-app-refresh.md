# One-click Application Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing refresh button automatically restart Clipbox onto the newest installed build while restoring the current view.

**Architecture:** The renderer rereads the encrypted vault, stores a one-shot validated view context, and sends a relaunch IPC event. Electron stops the running local server before relaunching so the replacement process loads the newest packaged runtime instead of reconnecting to the old server.

**Tech Stack:** TypeScript, React 19, Web Storage, Electron IPC, Node test runner.

## Global Constraints

- Keep the current refresh button placement and visual styling.
- Preserve content kind, directory, product filter, and search query across the automatic restart.
- Never relaunch if encrypted vault reading fails.
- Do not change the encrypted vault schema or add dependencies.
- Keep renderer-only execution as the existing in-page refresh fallback.
- Ship as desktop version `0.2.5`.

---

### Task 1: Add a validated one-shot refresh context

**Files:**
- Modify: `tests/clipbox-core.test.mjs`
- Modify: `app/clipbox-core.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- Produces: `RefreshContext` and `parseRefreshContext(value: string | null): RefreshContext | null`.
- Consumes: existing `resolveRefreshedFolder()` after the vault is open.

- [ ] **Step 1: Write the failing parser tests**

Add tests that hand-build a JSON string with `activeKind: "snippet"`, `activeFolder: "folder:开发"`, `productFilter: "镊子"`, and `query: "tweezer"`, then assert the parsed literal object. Add malformed JSON and invalid-kind assertions that return `null`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/clipbox-core.test.mjs
```

Expected: FAIL because `parseRefreshContext` is not exported.

- [ ] **Step 3: Implement the minimal parser**

Add the exact type:

```ts
export type RefreshContext = {
  activeKind: ItemKind;
  activeFolder: string;
  productFilter: string;
  query: string;
};
```

Parse JSON defensively, accept only `secret` or `snippet`, require the remaining properties to be strings, and return `null` for absent, malformed, or invalid values.

- [ ] **Step 4: Restore the one-shot context after vault load**

Use a dedicated `clipbox:refresh-context` local-storage key. Consume and delete it at the beginning of the vault-opening effect. When data is ready, restore `activeKind`, validate the directory with `resolveRefreshedFolder(data.folders[context.activeKind], context.activeFolder)`, and restore the product filter and query.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
node --test tests/clipbox-core.test.mjs
```

Expected: all tests in the file pass.

### Task 2: Relaunch the desktop application from the refresh button

**Files:**
- Modify: `app/page.tsx`
- Modify: `desktop/preload.cjs`
- Modify: `desktop/main.cjs`

**Interfaces:**
- Produces renderer bridge: `window.clipboxDesktop.relaunch(): void`.
- Consumes: validated encrypted vault read and the one-shot `RefreshContext` from Task 1.

- [ ] **Step 1: Add the renderer-to-main bridge**

Expose `relaunch: () => ipcRenderer.send("clipbox:relaunch")` in the preload and declare it in the `Window` interface.

- [ ] **Step 2: Add safe Electron relaunch handling**

Register `clipbox:relaunch` once. Set `quitting = true`, unregister global shortcuts, stop the current child server, wait briefly for its exit with a bounded timeout, then call `app.relaunch()` followed by `app.exit(0)`. This prevents the new process from reusing the old packaged server.

- [ ] **Step 3: Upgrade the refresh flow**

After queued persistence and vault reading succeed, store this exact one-shot object:

```ts
{
  activeKind,
  activeFolder: resolveRefreshedFolder(opened.data.folders[activeKind], activeFolder),
  productFilter,
  query,
}
```

Show `正在重新加载…`, invoke `relaunch()`, and leave the spinner active until the process exits. When the bridge is unavailable, retain the existing `已刷新` in-page behavior. Change the accessible label to `重新加载本地数据和软件`.

- [ ] **Step 4: Exercise failure behavior**

Keep the existing catch path unchanged in outcome: show `刷新失败，当前数据未改变`, do not write the one-shot context, and do not invoke relaunch.

### Task 3: Package and verify v0.2.5

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: installed Clipbox v0.2.5.

- [ ] **Step 1: Bump the patch version**

Change the root package version from `0.2.4` to `0.2.5` in `package.json` and both root entries in `package-lock.json`.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test
npm run lint
npm run desktop:pack
```

Expected: all tests pass and both lint and packaging exit 0.

- [ ] **Step 3: Install and perform the real relaunch smoke test**

Back up `/Applications/Clipbox.app` as `/Applications/Clipbox-备份-v0.2.4.app`, install v0.2.5, and launch it with a remote-debugging port. Select the `开发` directory, product filter `镊子`, and query `tweezer`; click refresh and record the old Electron PID. Confirm the old PID exits, a new PID appears automatically, the app reports `0.2.5`, and the three view values are restored.

- [ ] **Step 4: Verify refresh failure does not restart**

In automated unit coverage, malformed refresh context must be ignored. In the real app, the successful encrypted-vault path must be used; no destructive manipulation of the user's actual encrypted vault is permitted for failure simulation.

- [ ] **Step 5: Commit**

```bash
git add app/clipbox-core.ts app/page.tsx desktop/main.cjs desktop/preload.cjs tests/clipbox-core.test.mjs package.json package-lock.json
git commit -m "feat: refresh and relaunch the desktop app"
```
