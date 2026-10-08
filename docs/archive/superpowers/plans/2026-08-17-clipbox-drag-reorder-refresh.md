# Clipbox Drag Reorder, Refresh, and Version Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent window dragging, manual card and directory ordering, permanent snippet numbers, local encrypted-data refresh, and installed-version display to Clipbox.

**Architecture:** Keep encrypted vault data as the source of truth. Extend its normalized schema with a monotonic snippet-number counter, use array order as the only manual-order representation, and isolate pure numbering/reordering rules in `app/clipbox-order.ts`. A small pointer-reorder hook owns transient drag state while `app/page.tsx` remains responsible for persistence and UI; Electron exposes only the package version through the existing preload bridge.

**Tech Stack:** React 19, TypeScript, native Pointer Events, CSS, Electron 37, Vinext, Node test runner. No new runtime dependency.

## Global Constraints

- Preserve the current Apple-inspired light interface and existing radius, accent, typography, and density system.
- Use native Pointer Events and the existing React/CSS stack; do not add a drag-and-drop package.
- Use only transform, opacity, and shadow for drag motion; honor `prefers-reduced-motion`.
- Fixed snippet numbers use `CB-0001` format, never change, and are never reused after deletion.
- Pinned cards remain above unpinned cards and cannot cross that boundary through dragging.
- Disable card dragging while search text is non-empty or product filter is not `全部产品`.
- System directories `全部`, `置顶`, and `未分类` remain fixed; only custom directories reorder.
- Refresh rereads and decrypts local data while preserving the current valid view; it never checks or downloads online updates.
- `package.json` is the single source for the displayed installed version.
- Do not place visible em-dash or en-dash characters in UI copy.
- Preserve the existing 160 imported snippets and the fixed desktop origin `http://127.0.0.1:47831`.

---

### Task 1: Permanent Snippet Number Migration

**Files:**
- Create: `app/clipbox-order.ts`
- Modify: `app/clipbox-core.ts`
- Modify: `tests/clipbox-core.test.mjs`
- Create: `tests/clipbox-order.test.mjs`

**Interfaces:**
- Produces: `formatSnippetNumber(sequence: number): string`
- Produces: `normalizeSnippetNumbers(items: SecretItem[], requestedNext?: number): { items: SecretItem[]; nextSnippetNumber: number }`
- Extends: `SecretItem.snippetNumber?: string`
- Extends: `VaultData.nextSnippetNumber: number`
- Changes: `synchronizeVaultData(items, folders, nextSnippetNumber): VaultData`

- [ ] **Step 1: Write failing fixed-number tests**

Add focused cases to `tests/clipbox-order.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { formatSnippetNumber, normalizeSnippetNumbers } from "../app/clipbox-order.ts";

const snippet = (id, snippetNumber) => ({
  id, label: id, secret: "hello", note: "", color: "#fff", kind: "snippet",
  snippetNumber, createdAt: 1, updatedAt: 1,
});

test("assigns stable unique numbers and advances past existing numbers", () => {
  const result = normalizeSnippetNumbers([
    snippet("a", "CB-0007"), snippet("b"), snippet("c", "CB-0007"),
  ], 4);
  assert.deepEqual(result.items.map((item) => item.snippetNumber), ["CB-0007", "CB-0008", "CB-0009"]);
  assert.equal(result.nextSnippetNumber, 10);
});

test("never moves the counter backward after the highest item was deleted", () => {
  const result = normalizeSnippetNumbers([snippet("a", "CB-0002")], 12);
  assert.equal(result.nextSnippetNumber, 12);
});

test("does not number secret items", () => {
  const secret = { ...snippet("secret"), kind: "secret" };
  assert.equal(normalizeSnippetNumbers([secret], 1).items[0].snippetNumber, undefined);
});

test("formats sequences with four digits and grows naturally", () => {
  assert.equal(formatSnippetNumber(1), "CB-0001");
  assert.equal(formatSnippetNumber(12345), "CB-12345");
});
```

Extend `tests/clipbox-core.test.mjs` so legacy arrays normalize to `nextSnippetNumber: 2` and their one snippet receives `CB-0001`.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
node --test tests/clipbox-order.test.mjs tests/clipbox-core.test.mjs
```

Expected: FAIL because the new module, fields, and counter do not exist.

- [ ] **Step 3: Implement deterministic numbering**

In `app/clipbox-order.ts`, pre-scan syntactically valid numbers, preserve the first occurrence, allocate missing or duplicate numbers above both the saved counter and highest valid number, and return the next unused sequence. Do not mutate input items.

In `app/clipbox-core.ts`:

```ts
export type SecretItem = {
  // existing fields
  snippetNumber?: string;
};

export type VaultData = {
  items: SecretItem[];
  folders: FolderRegistry;
  nextSnippetNumber: number;
};
```

Call `normalizeSnippetNumbers` from `normalizeVaultData`. Thread `nextSnippetNumber` through `synchronizeVaultData`, replace-import, merge-import, initial empty vault creation, and backup normalization. When merging, current local numbers win: clear an incoming number that collides with a current number before final normalization.

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
node --test tests/clipbox-order.test.mjs tests/clipbox-core.test.mjs tests/snippet-import.test.mjs
npm test
```

Expected: all tests pass, including legacy migration and import behavior.

- [ ] **Step 5: Commit the numbering migration**

```bash
git add app/clipbox-order.ts app/clipbox-core.ts tests/clipbox-order.test.mjs tests/clipbox-core.test.mjs
git commit -m "feat: add permanent snippet numbers"
```

### Task 2: Preserve Manual Card and Directory Order

**Files:**
- Modify: `app/clipbox-order.ts`
- Modify: `app/clipbox-core.ts`
- Modify: `app/snippet-import.ts`
- Modify: `app/page.tsx`
- Modify: `tests/clipbox-order.test.mjs`
- Modify: `tests/clipbox-core.test.mjs`
- Modify: `tests/snippet-import.test.mjs`

**Interfaces:**
- Produces: `reorderVisibleItems(items: SecretItem[], visibleIds: string[], sourceId: string, targetId: string): SecretItem[]`
- Produces: `moveVisibleItem(items: SecretItem[], visibleIds: string[], itemId: string, delta: -1 | 1): SecretItem[]`
- Produces: `reorderNames(names: string[], source: string, target: string): string[]`
- Produces: `moveName(names: string[], name: string, delta: -1 | 1): string[]`
- Produces: `canReorderCards(query: string, productFilter: string): boolean`

- [ ] **Step 1: Write failing ordering tests**

Add tests covering visible-subset replacement and boundaries:

```js
test("reorders only visible items and preserves hidden relative order", () => {
  const items = [snippet("a"), snippet("hidden-1"), snippet("b"), snippet("hidden-2"), snippet("c")];
  const reordered = reorderVisibleItems(items, ["a", "b", "c"], "c", "a");
  assert.deepEqual(reordered.map((item) => item.id), ["c", "hidden-1", "a", "hidden-2", "b"]);
});

test("rejects drag across pinned groups", () => {
  const pinned = { ...snippet("p"), pinned: true };
  const normal = snippet("n");
  assert.deepEqual(reorderVisibleItems([pinned, normal], ["p", "n"], "p", "n"), [pinned, normal]);
});

test("reorders and keyboard-moves custom directory names", () => {
  assert.deepEqual(reorderNames(["报价", "产品", "售后"], "售后", "报价"), ["售后", "报价", "产品"]);
  assert.deepEqual(moveName(["报价", "产品", "售后"], "产品", 1), ["报价", "售后", "产品"]);
});

test("allows card ordering only for complete unfiltered lists", () => {
  assert.equal(canReorderCards("", "全部产品"), true);
  assert.equal(canReorderCards("报价", "全部产品"), false);
  assert.equal(canReorderCards("", "镊子"), false);
});
```

Update core tests to expect folder normalization, creation, and merging to preserve first-seen order instead of Chinese alphabetical order. Update snippet-import tests to expect imported folder order to match first workbook appearance.

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
node --test tests/clipbox-order.test.mjs tests/clipbox-core.test.mjs tests/snippet-import.test.mjs
```

Expected: FAIL on missing reorder functions and current alphabetical folder sorting.

- [ ] **Step 3: Implement order helpers and remove automatic sorting**

Implement reorder helpers as immutable operations. `reorderVisibleItems` must replace only the slots occupied by `visibleIds`, refuse missing IDs, refuse pinned-boundary crossing, and leave every other item untouched.

In `clipbox-core.ts`, change folder normalization to an insertion-order `Set`, append new folders, and merge as `[...current, ...incoming]` with stable deduplication.

In `page.tsx`, change the `filtered` result to preserve source array order while performing only a stable pinned-first partition:

```ts
return matched.toSorted((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
```

Remove `structuredSnippetRank` from the page import. Keep the rank helper if tests or other consumers still use it.

In spreadsheet import, preserve the workbook's first-seen folder order and the row order of imported items.

- [ ] **Step 4: Run focused and full tests**

```bash
node --test tests/clipbox-order.test.mjs tests/clipbox-core.test.mjs tests/snippet-import.test.mjs
npm test
```

Expected: all tests pass and existing search/product matching remains unchanged.

- [ ] **Step 5: Commit manual ordering rules**

```bash
git add app/clipbox-order.ts app/clipbox-core.ts app/snippet-import.ts app/page.tsx tests/clipbox-order.test.mjs tests/clipbox-core.test.mjs tests/snippet-import.test.mjs
git commit -m "feat: preserve manual card and folder order"
```

### Task 3: Pointer and Keyboard Reorder Engine

**Files:**
- Create: `app/pointer-reorder.ts`
- Create: `app/use-pointer-reorder.ts`
- Create: `tests/pointer-reorder.test.mjs`

**Interfaces:**
- Produces: `PointerDragState = { sourceId: string; overId: string; pointerId: number; startX: number; startY: number; active: boolean } | null`
- Produces: `pointerDragReducer(state, action): PointerDragState`
- Produces: `usePointerReorder({ enabled, scope, onDrop })`
- Hook returns: `{ draggingId, overId, beginPointerDrag, cancelPointerDrag }`

- [ ] **Step 1: Write failing drag-state tests**

```js
test("does not activate before the movement threshold", () => {
  const started = pointerDragReducer(null, { type: "start", id: "a", pointerId: 3, x: 10, y: 10 });
  const moved = pointerDragReducer(started, { type: "move", pointerId: 3, x: 12, y: 12, overId: "b" });
  assert.equal(moved.active, false);
});

test("activates after five pixels and tracks the current target", () => {
  const started = pointerDragReducer(null, { type: "start", id: "a", pointerId: 3, x: 10, y: 10 });
  const moved = pointerDragReducer(started, { type: "move", pointerId: 3, x: 10, y: 16, overId: "b" });
  assert.deepEqual({ active: moved.active, overId: moved.overId }, { active: true, overId: "b" });
});

test("ignores a different pointer and cancels cleanly", () => {
  const started = pointerDragReducer(null, { type: "start", id: "a", pointerId: 3, x: 0, y: 0 });
  assert.equal(pointerDragReducer(started, { type: "move", pointerId: 4, x: 20, y: 20, overId: "b" }), started);
  assert.equal(pointerDragReducer(started, { type: "cancel" }), null);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
node --test tests/pointer-reorder.test.mjs
```

Expected: FAIL because `app/pointer-reorder.ts` does not exist.

- [ ] **Step 3: Implement the reducer and hook**

The reducer owns the 5px activation threshold. The hook must:

- set pointer capture on the handle;
- preserve the pointer-to-card grab offset and update the dragged card's `transform: translate3d(...)` directly so the card tracks the pointer 1:1 without React rendering every coordinate;
- attach `pointermove`, `pointerup`, `pointercancel`, and `keydown` cleanup listeners only during a pending drag;
- find targets with `document.elementFromPoint(x, y)?.closest('[data-sort-scope="<scope>"]')` and its `data-sort-id`;
- call `onDrop(sourceId, overId)` only when active and IDs differ;
- cancel when `enabled` becomes false or the component unmounts;
- never use React state for raw continuous coordinates beyond reducer transitions needed to update target identity.

- [ ] **Step 4: Run tests and lint**

```bash
node --test tests/pointer-reorder.test.mjs
npm run lint
```

Expected: tests and lint pass with listener cleanup accepted by React Hooks linting.

- [ ] **Step 5: Commit the drag engine**

```bash
git add app/pointer-reorder.ts app/use-pointer-reorder.ts tests/pointer-reorder.test.mjs
git commit -m "feat: add pointer reorder engine"
```

### Task 4: Card, Directory, and Window Drag UI

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/clipbox-order.test.mjs`

**Interfaces:**
- Consumes: `usePointerReorder`, `reorderVisibleItems`, `moveVisibleItem`, `reorderNames`, and `moveName`
- Produces: persistent card and directory ordering through the existing `persist` queue

- [ ] **Step 1: Add failing reorder-availability and keyboard-boundary cases**

Extend `tests/clipbox-order.test.mjs` so moving the first item up and last item down is a no-op, pinned items can keyboard-move only among pinned visible IDs, and `canReorderCards` rejects a non-empty query or product filter.

- [ ] **Step 2: Run the focused test and confirm RED for uncovered behavior**

```bash
node --test tests/clipbox-order.test.mjs
```

Expected: FAIL because `canReorderCards` is not implemented yet.

- [ ] **Step 3: Wire card dragging and keyboard sorting**

In `page.tsx`:

- derive `cardDragEnabled` through `canReorderCards(query, productFilter)`;
- create a card reorder hook with scope `card`;
- make the existing left color strip a real button with `aria-label="拖动排序 <label>"` and `data-sort-handle`;
- add `data-sort-scope="card"`, `data-sort-id`, `dragging`, and `drag-over` classes to each row;
- on drop, snapshot `itemsRef.current`, call `reorderVisibleItems`, persist the result, and restore the snapshot with a failure toast if encryption fails;
- on `Option + ArrowUp/ArrowDown`, use `moveVisibleItem`, persist, retain focus, and announce the new position through the existing toast;
- cancel both card and directory drag when kind, folder, search, product filter, or a modal changes.

Render snippet secondary text as:

```tsx
<small>
  <span className="snippet-number">{item.snippetNumber}</span>
  <span>{item.summary || "未填写总结"}</span>
</small>
```

Show the number read-only in the snippet editor header. Do not expose an editable input.

- [ ] **Step 4: Wire custom-directory dragging**

- Keep the three system directory buttons outside sortable targets.
- Add a small focusable handle to each mapped custom directory.
- Use scope `folder` and persist an updated `FolderRegistry` from `reorderNames`.
- Support `Option + ArrowUp/ArrowDown` with `moveName`.
- Preserve `activeFolder` and selected card after directory reorder.

- [ ] **Step 5: Expand the title-bar drag region and add polished drag states**

In `globals.css`:

```css
.native-titlebar,
.native-titlebar strong,
.native-titlebar .traffic-lights {
  -webkit-app-region: drag;
}

.drag-handle,
.folder-drag-handle,
button,
input,
select,
textarea {
  -webkit-app-region: no-drag;
}
```

Add cursor states (`grab`, `grabbing`), a restrained lifted shadow/scale, a violet insertion line, disabled handle opacity, and a `prefers-reduced-motion: reduce` override that removes transform transitions. Avoid horizontal layout shift at 500px minimum width.

- [ ] **Step 6: Run tests, lint, and build**

```bash
node --test tests/clipbox-order.test.mjs tests/pointer-reorder.test.mjs
npm run lint
npm run build
```

Expected: all commands pass; production CSS contains the title-bar drag rule and drag-state selectors.

- [ ] **Step 7: Commit drag UI**

```bash
git add app/page.tsx app/globals.css tests/clipbox-order.test.mjs
git commit -m "feat: reorder cards and directories by drag"
```

### Task 5: Local Refresh and Installed Version Display

**Files:**
- Modify: `app/clipbox-core.ts`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `desktop/main.cjs`
- Modify: `desktop/preload.cjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/clipbox-core.test.mjs`

**Interfaces:**
- Produces: `resolveRefreshedFolder(folders: string[], activeFolder: string): string`
- Extends preload bridge: `getVersion(): Promise<string>`
- Adds IPC handler: `clipbox:get-version`
- Updates app version: `0.2.0`, verified through the packaged application's rendered settings value

- [ ] **Step 1: Write failing refresh-view and version tests**

Add:

```js
test("preserves valid special and custom folders after refresh", () => {
  assert.equal(resolveRefreshedFolder(["报价", "售后"], "folder:售后"), "folder:售后");
  assert.equal(resolveRefreshedFolder(["报价"], "folder:已删除"), "all");
  assert.equal(resolveRefreshedFolder([], "pinned"), "pinned");
  assert.equal(resolveRefreshedFolder([], "uncategorized"), "uncategorized");
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
node --test tests/clipbox-core.test.mjs
```

Expected: FAIL because the refresh-view resolver is absent.

- [ ] **Step 3: Extract reusable local-vault reading and implement refresh**

Refactor the initial `openVault` path in `page.tsx` into one async reader used both at startup and refresh. The refresh handler must:

1. cancel active drag;
2. set `refreshing` without clearing the visible list;
3. read `STORAGE_KEY` and `DEVICE_KEY`;
4. decrypt and call `normalizeVaultData`;
5. update items, folders, and `nextSnippetNumber` refs/state;
6. retain active kind, query, and product filter;
7. retain a valid active folder through `resolveRefreshedFolder`, otherwise select `all`;
8. show `已刷新` on success;
9. keep the prior snapshot and show `刷新失败，当前数据未改变` on error.

Add a refresh button to the right side of `.native-search`, before the product filter. Use the visible label `刷新`, rotate its icon only during the finite loading state, disable repeat clicks, and provide `aria-live` feedback through the existing toast.

- [ ] **Step 4: Expose and render the installed version**

In `desktop/main.cjs`:

```js
ipcMain.handle("clipbox:get-version", () => app.getVersion());
```

In `desktop/preload.cjs`:

```js
getVersion: () => ipcRenderer.invoke("clipbox:get-version"),
```

Extend the Window type and load the value once. Add a noninteractive footer inside the settings dropdown:

```tsx
<div className="settings-version">{appVersion ? `版本 v${appVersion}` : "开发版本"}</div>
```

Style it with a top divider and low visual weight. It must not close the menu or resemble an action.

Change both package manifests to version `0.2.0` with:

```bash
npm install --package-lock-only --ignore-scripts
```

- [ ] **Step 5: Run focused and full checks**

```bash
node --test tests/clipbox-core.test.mjs
npm test
npm run lint
git diff --check
```

Expected: 0 failures; no visible UI copy contains an em-dash or en-dash.

- [ ] **Step 6: Commit refresh and version UI**

```bash
git add app/clipbox-core.ts app/page.tsx app/globals.css desktop/main.cjs desktop/preload.cjs package.json package-lock.json tests/clipbox-core.test.mjs
git commit -m "feat: refresh local vault and show app version"
```

### Task 6: Desktop Verification, Packaging, and Installation

**Files:**
- Verify: all tracked source and tests
- Generate: `release/mac-arm64/Clipbox.app` (ignored build output)
- Install: `/Applications/Clipbox.app`
- Preserve: `/Applications/Clipbox-备份-v0.1.0-structured.app`

**Interfaces:**
- Consumes: fixed origin `http://127.0.0.1:47831`, package version `0.2.0`, existing real encrypted profile, and all UI features above
- Produces: verified installed Clipbox `v0.2.0`

- [ ] **Step 1: Run the complete clean verification gate**

```bash
npm test
npm run lint
npm run build
npm run desktop:pack
git diff --check
git status --short
```

Expected:

- all Node tests pass;
- lint passes;
- Vinext production build passes and emits CSS;
- Electron builder creates `release/mac-arm64/Clipbox.app`;
- only intentional tracked changes exist before the final commit.

- [ ] **Step 2: Verify the built app against a temporary profile**

Quit every running Clipbox instance. Launch the built app with a temporary user-data directory and a fixed remote-debugging port. Through Chrome DevTools Protocol:

- create at least three snippet rows and three custom directories;
- verify every snippet receives a unique `CB-` number;
- dispatch pointer down/move/up from one card handle to another and assert DOM order changes;
- repeat for custom directories;
- use `Option + ArrowDown` on a handle and assert one-position movement;
- set a search term and assert drag handles become disabled;
- click refresh and assert query, directory, and product filter remain unchanged;
- open settings and assert `版本 v0.2.0`;
- capture a 680×620 screenshot and inspect it at full size;
- relaunch the same temporary profile and assert order and numbers persist.

Do not read or print encrypted payloads, device keys, clipboard data, or other credentials.

- [ ] **Step 3: Verify the real 160-row profile without mutating order**

Launch the built app against the normal Clipbox profile and use read-only DOM checks to assert:

```json
{
  "snippetCount": 160,
  "uniqueSnippetNumbers": 160,
  "customDirectories": 13,
  "version": "v0.2.0",
  "origin": "http://127.0.0.1:47831"
}
```

Click refresh once and confirm all four values remain unchanged. Capture the installed-state screenshot for visual inspection.

- [ ] **Step 4: Back up and install the verified app**

After closing Clipbox, preserve the current installed app with a recoverable move:

```bash
mv /Applications/Clipbox.app /Applications/Clipbox-备份-v0.1.0-structured.app
ditto release/mac-arm64/Clipbox.app /Applications/Clipbox.app
```

If the backup target already exists, stop and choose a new explicit timestamped backup name. Never overwrite an existing backup.

- [ ] **Step 5: Verify the installed application**

Launch `/Applications/Clipbox.app`, connect through a temporary remote-debugging port, and confirm:

- origin is `http://127.0.0.1:47831`;
- stylesheet count is at least 1;
- `话术 160` is visible;
- 160 unique fixed numbers exist;
- 16 directory buttons exist including three fixed system entries;
- settings shows `版本 v0.2.0`;
- refresh retains the active directory, search, and product filter;
- a 680×620 capture has no overlap or clipped controls.

Then close the debugging instance and reopen Clipbox normally for the user.

- [ ] **Step 6: Run final repository checks and commit any verification-only source fixes**

If verification uncovered a source issue, fix it through a failing test and rerun Steps 1-5. Otherwise confirm:

```bash
git status --short
git log --oneline -8
```

Expected: clean tracked worktree with the feature commits present. Do not commit `release/`, screenshots, temporary profiles, or verification scripts containing machine-specific paths.
