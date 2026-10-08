# Clipbox Manual Summary and Folder Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve Clipbox’s current visual baseline while making summaries manually editable and button-generated, and replacing free-text directory assignment with encrypted, selectable directories created from the sidebar.

**Architecture:** Extract the new vault normalization and folder-registry rules into a small pure TypeScript module so legacy migration and directory behavior can be tested without rendering React. Keep application orchestration in the existing `Home` and `ItemEditor` components, add one focused `FolderDialog`, and extend the encrypted payload from an item array to `{ items, folders }` while preserving the outer encryption and backup envelopes.

**Tech Stack:** React 19, TypeScript 5.9, Vinext/Vite 8, Node 24 test runner, Electron 37, existing CSS without new dependencies.

## Global Constraints

- Keep the current main-window structure, colors, radii, list density, copy feedback, and motion language.
- Summary generation is manual-only: saving must never start a background summary.
- Summary input accepts at most 10 Unicode code points and remains editable after generation.
- AI uses the existing local `window.LanguageModel` path with the existing private local-rule fallback; no network API or credentials.
- Item editors assign directories only through a select control; arbitrary directory text is rejected.
- Directory names are encrypted with items and scoped independently to `secret` and `snippet`.
- Preserve AES-GCM, PBKDF2, device-key storage, `VaultEnvelope`, secure backup v2, and legacy array payload compatibility.
- Do not add dependencies or perform unrelated refactors.
- Verify at `680 × 620` and `500 × 520`, with normal and reduced motion.

---

## File Structure

- Create `app/clipbox-core.ts`: shared item/folder types and pure normalization, limiting, folder-add, and registry-merge functions.
- Modify `app/page.tsx`: encrypted `VaultData` state, legacy migration, import/export integration, folder creation, manual AI summary, and editor directory selection.
- Modify `app/globals.css`: compact directory header/create dialog, native select, and editable summary field styles that match the existing modal.
- Create `tests/clipbox-core.test.mjs`: executable data-model and migration tests.
- Modify `package.json`: run every `tests/*.test.mjs` file after the build.
- Modify `README.md`: replace background auto-summary and free-text directory documentation with the final manual interactions.

---

### Task 1: Pure Vault and Folder Model

**Files:**
- Create: `app/clipbox-core.ts`
- Create: `tests/clipbox-core.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `ItemKind`, `SecretItem`, `FolderRegistry`, `VaultData`, `EMPTY_FOLDER_REGISTRY`, `limitChars(value, length?)`, `normalizeFolderName(value)`, `normalizeVaultData(payload)`, `addFolder(registry, kind, rawName)`, and `mergeFolderRegistries(current, incoming)`.
- Consumes: no application state or browser APIs.

- [ ] **Step 1: Expand the test script and write failing pure-model tests**

Change `package.json`:

```json
"test": "npm run build && node --test tests/*.test.mjs"
```

Create `tests/clipbox-core.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  addFolder,
  limitChars,
  mergeFolderRegistries,
  normalizeVaultData,
} from "../app/clipbox-core.ts";

const legacyItems = [
  { id: "s1", label: "登录", secret: "alpha", note: "", color: "#fff", kind: "secret", folder: "工作", createdAt: 1, updatedAt: 1 },
  { id: "t1", label: "售后", secret: "hello", note: "", color: "#fff", kind: "snippet", folder: "客服", createdAt: 1, updatedAt: 1 },
];

test("limits summaries by Unicode code point", () => {
  assert.equal(limitChars("一二三四五六七八九十十一"), "一二三四五六七八九十");
  assert.equal(limitChars("😀😀😀", 2), "😀😀");
});

test("normalizes a legacy item array into per-kind encrypted folders", () => {
  assert.deepEqual(normalizeVaultData(legacyItems), {
    items: legacyItems,
    folders: { secret: ["工作"], snippet: ["客服"] },
  });
});

test("normalizes and deduplicates a new vault payload", () => {
  const data = normalizeVaultData({
    items: legacyItems,
    folders: { secret: [" 工作 ", "工作", "个人"], snippet: ["客服"] },
  });
  assert.deepEqual(data.folders, { secret: ["个人", "工作"], snippet: ["客服"] });
});

test("adds a scoped directory and reports duplicate names", () => {
  const first = addFolder({ secret: [], snippet: [] }, "snippet", " 售后 ");
  assert.deepEqual(first, { folders: { secret: [], snippet: ["售后"] }, folder: "售后", created: true });
  assert.equal(addFolder(first.folders, "snippet", "售后").created, false);
  assert.equal(addFolder(first.folders, "snippet", "   ").folder, "");
});

test("merges folder registries without crossing content kinds", () => {
  assert.deepEqual(
    mergeFolderRegistries(
      { secret: ["工作"], snippet: ["售后"] },
      { secret: ["个人"], snippet: ["售后", "物流"] },
    ),
    { secret: ["个人", "工作"], snippet: ["售后", "物流"] },
  );
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/clipbox-core.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `app/clipbox-core.ts`.

- [ ] **Step 3: Implement the minimal pure model**

Create `app/clipbox-core.ts` with browser-free types and functions:

```ts
export type ItemKind = "secret" | "snippet";

export type SecretItem = {
  id: string;
  label: string;
  secret: string;
  note: string;
  color: string;
  kind?: ItemKind;
  summary?: string;
  folder?: string;
  pinned?: boolean;
  lastUsedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type FolderRegistry = Record<ItemKind, string[]>;
export type VaultData = { items: SecretItem[]; folders: FolderRegistry };
export const EMPTY_FOLDER_REGISTRY: FolderRegistry = { secret: [], snippet: [] };

export function limitChars(value: string, length = 10) {
  return Array.from(value.trim()).slice(0, length).join("");
}

export function normalizeFolderName(value: string) {
  return Array.from(value.trim()).slice(0, 30).join("");
}

function normalizeFolderList(values: unknown, extracted: string[]) {
  const source = Array.isArray(values) ? values : [];
  return Array.from(new Set([...source, ...extracted].filter((value): value is string => typeof value === "string").map(normalizeFolderName).filter(Boolean))).toSorted((a, b) => a.localeCompare(b, "zh-CN"));
}

export function normalizeVaultData(payload: unknown): VaultData {
  const items = Array.isArray(payload)
    ? payload as SecretItem[]
    : payload && typeof payload === "object" && Array.isArray((payload as VaultData).items)
      ? (payload as VaultData).items
      : [];
  const supplied = !Array.isArray(payload) && payload && typeof payload === "object"
    ? (payload as Partial<VaultData>).folders
    : undefined;
  const extracted = (kind: ItemKind) => items
    .filter((item) => (item.kind || "secret") === kind)
    .map((item) => item.folder || "");
  return {
    items,
    folders: {
      secret: normalizeFolderList(supplied?.secret, extracted("secret")),
      snippet: normalizeFolderList(supplied?.snippet, extracted("snippet")),
    },
  };
}

export function addFolder(registry: FolderRegistry, kind: ItemKind, rawName: string) {
  const folder = normalizeFolderName(rawName);
  if (!folder) return { folders: registry, folder: "", created: false };
  if (registry[kind].includes(folder)) return { folders: registry, folder, created: false };
  return {
    folders: { ...registry, [kind]: [...registry[kind], folder].toSorted((a, b) => a.localeCompare(b, "zh-CN")) },
    folder,
    created: true,
  };
}

export function mergeFolderRegistries(current: FolderRegistry, incoming: FolderRegistry): FolderRegistry {
  return {
    secret: normalizeFolderList(current.secret, incoming.secret),
    snippet: normalizeFolderList(current.snippet, incoming.snippet),
  };
}
```

- [ ] **Step 4: Run focused tests and the production build**

Run: `node --test tests/clipbox-core.test.mjs && npm run build`

Expected: 5 tests PASS and build exits 0.

- [ ] **Step 5: Commit Task 1 files only**

```bash
git add app/clipbox-core.ts tests/clipbox-core.test.mjs package.json
git commit -m "feat: add encrypted folder registry model"
```

---

### Task 2: Wire VaultData Through Encryption, State, and Backups

**Files:**
- Modify: `app/clipbox-core.ts`
- Modify: `app/page.tsx`
- Modify: `tests/clipbox-core.test.mjs`

**Interfaces:**
- Consumes: `VaultData`, `FolderRegistry`, `SecretItem`, `ItemKind`, `EMPTY_FOLDER_REGISTRY`, `normalizeVaultData`, and `mergeFolderRegistries` from Task 1.
- Produces: tested `mergeImportedVaultData(current, incoming, strategy, createId)` plus `Home` state and `persist(nextItems, nextFolders?)` that always write one encrypted `VaultData`.

- [ ] **Step 1: Write failing import merge/replace behavior tests**

Add `mergeImportedVaultData` to the import list, then extend `tests/clipbox-core.test.mjs`:

```js
test("merges imported items and per-kind folders without duplicate content", () => {
  const current = normalizeVaultData(legacyItems);
  const incoming = normalizeVaultData({
    items: [legacyItems[1], { ...legacyItems[0], id: "s1", label: "新秘密", secret: "beta", folder: "个人" }],
    folders: { secret: ["空秘密"], snippet: ["空话术"] },
  });
  const result = mergeImportedVaultData(current, incoming, "merge", () => "fresh-id");
  assert.equal(result.importedCount, 1);
  assert.deepEqual(result.data.items.map((item) => item.id), ["fresh-id", "s1", "t1"]);
  assert.deepEqual(result.data.folders, {
    secret: ["个人", "工作", "空秘密"],
    snippet: ["客服", "空话术"],
  });
});

test("replace import discards current items and directories", () => {
  const incoming = normalizeVaultData({ items: [], folders: { secret: ["空秘密"], snippet: ["空话术"] } });
  const result = mergeImportedVaultData(normalizeVaultData(legacyItems), incoming, "replace", () => "unused");
  assert.deepEqual(result, { data: incoming, importedCount: 0 });
});
```

- [ ] **Step 2: Run the focused test before wiring the application**

Run: `node --test tests/clipbox-core.test.mjs`

Expected: FAIL because `mergeImportedVaultData` is not exported.

- [ ] **Step 3: Implement the tested import merge boundary**

Add `ImportStrategy = "merge" | "replace"` and `mergeImportedVaultData` to `app/clipbox-core.ts`. Preserve the current signature-based duplicate rule (`kind + label + secret`), replace colliding incoming IDs via the supplied `createId`, merge folder registries only for merge mode, and return `{ data, importedCount }`.

- [ ] **Step 4: Replace page-local types/helpers with core imports**

At the top of `app/page.tsx`, import:

```ts
import {
  EMPTY_FOLDER_REGISTRY,
  limitChars,
  mergeImportedVaultData,
  normalizeVaultData,
  type FolderRegistry,
  type ItemKind,
  type SecretItem,
  type VaultData,
} from "./clipbox-core";
```

Remove duplicate page-local `SecretItem`, `ItemKind`, `ImportStrategy`, and `limitChars` definitions. Change `encryptVault` to accept `VaultData`; change `decryptVault` to parse `unknown` and return `normalizeVaultData(parsed)`.

- [ ] **Step 5: Add synchronized encrypted folder state**

Add:

```ts
const [folders, setFolders] = useState<FolderRegistry>(EMPTY_FOLDER_REGISTRY);
const foldersRef = useRef<FolderRegistry>(EMPTY_FOLDER_REGISTRY);
```

Every vault-open path must set both items and folders from normalized `VaultData`. Replace the derived `folders` memo with `const activeFolders = folders[activeKind]`. Update `persist` to accept `nextItems` and optional `nextFolders`, update both refs/states, and encrypt `{ items: nextItems, folders: resolvedFolders }` in one queue entry.

- [ ] **Step 6: Preserve folders across export, import merge, and import replace**

Change export to encrypt `{ items: itemsRef.current, folders: foldersRef.current }`. Normalize imported payloads at the decryption boundary. Replace the page-local import de-duplication block with `mergeImportedVaultData(currentData, importedData, strategy, () => crypto.randomUUID())`, then persist the returned items and folders together.

- [ ] **Step 7: Run core tests, full tests, lint, and build**

Run: `node --test tests/clipbox-core.test.mjs && npm test && npm run lint && npm run build`

Expected: all commands exit 0; existing rendered-shell test remains green.

- [ ] **Step 8: Commit Task 2 files only**

```bash
git add app/clipbox-core.ts app/page.tsx tests/clipbox-core.test.mjs
git commit -m "feat: persist encrypted directory registries"
```

---

### Task 3: Manual Summary, Directory Select, and Folder Dialog UI

**Files:**
- Modify: `app/clipbox-core.ts`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/clipbox-core.test.mjs`

**Interfaces:**
- Consumes: `addFolder`, `limitChars`, `activeFolders`, and `persist` from Tasks 1–2; existing `aiSummary(value)` and `ItemEditor` save contract.
- Produces: tested `resolveSelectedFolder` and `resolveGeneratedSummary` helpers, `FolderDialog`, `createFolder(rawName)`, a native editor directory `<select>`, and manual-only AI summary controls.

- [ ] **Step 1: Write failing selection and generated-summary behavior tests**

Add `resolveGeneratedSummary` and `resolveSelectedFolder` to the import list in `tests/clipbox-core.test.mjs`, then add:

```js
test("accepts only an available directory selection", () => {
  assert.equal(resolveSelectedFolder(["售后", "物流"], "物流"), "物流");
  assert.equal(resolveSelectedFolder(["售后", "物流"], "不存在"), "");
});

test("accepts a generated summary only while source content is unchanged", () => {
  assert.deepEqual(resolveGeneratedSummary("原内容", "原内容", "旧总结", "一二三四五六七八九十十一"), {
    summary: "一二三四五六七八九十",
    stale: false,
    error: "",
  });
  assert.deepEqual(resolveGeneratedSummary("原内容", "新内容", "旧总结", "新总结"), {
    summary: "旧总结",
    stale: true,
    error: "",
  });
  assert.deepEqual(resolveGeneratedSummary("原内容", "原内容", "旧总结", ""), {
    summary: "旧总结",
    stale: false,
    error: "暂时无法生成，请手动填写",
  });
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `node --test tests/clipbox-core.test.mjs`

Expected: FAIL because `resolveSelectedFolder` and `resolveGeneratedSummary` are not exported.

- [ ] **Step 3: Implement the two pure interaction helpers**

In `app/clipbox-core.ts`, add:

```ts
export function resolveSelectedFolder(folders: string[], requested: string) {
  return folders.includes(requested) ? requested : "";
}

export function resolveGeneratedSummary(startedWith: string, currentContent: string, currentSummary: string, generated: string) {
  if (startedWith !== currentContent) return { summary: currentSummary, stale: true, error: "" };
  const summary = limitChars(generated);
  return summary
    ? { summary, stale: false, error: "" }
    : { summary: currentSummary, stale: false, error: "暂时无法生成，请手动填写" };
}
```

- [ ] **Step 4: Remove background summary orchestration**

Delete `summarizingIds`, `summarizingRef`, `generateSummaryForItem`, and the summary-worker `useEffect`. Change the list subtitle for snippets to:

```tsx
<small>{item.summary || "未填写总结"}</small>
```

Remove the content-change branch that clears summaries automatically; the editor’s explicit summary state is the saved value.

- [ ] **Step 5: Add sidebar folder creation and empty-directory rendering**

Replace the plain directory label with:

```tsx
<div className="directory-heading">
  <p className="directory-label">目录</p>
  <button type="button" onClick={() => setFolderDialogOpen(true)} aria-label="新建目录">＋</button>
</div>
```

Render every `activeFolders` entry, including count `0`, without filtering by existing items. Add `FolderDialog` state and a `createFolder(rawName)` handler that calls `addFolder(foldersRef.current, activeKind, rawName)`, persists a newly created registry, switches `activeFolder` to `folder:${folder}`, and reports duplicate/success state without creating a second entry.

- [ ] **Step 6: Implement the compact accessible FolderDialog**

Add a sibling component with this contract:

```ts
function FolderDialog({ kind, onClose, onCreate }: {
  kind: ItemKind;
  onClose: () => void;
  onCreate: (name: string) => Promise<{ created: boolean; folder: string; error?: string }>;
})
```

The dialog uses `role="dialog"`, `aria-modal="true"`, focuses its input, rejects a trimmed empty name inline, caps names at 30 code points, supports Enter submit and Esc close, and exposes only “取消” and “创建”.

- [ ] **Step 7: Replace ItemEditor directory input with select**

Use:

```tsx
<label className="native-field folder-field">
  <span>目录 <small>可选</small></span>
  <div className="folder-select">
    <select value={folder} onChange={(event) => setFolder(event.target.value)}>
      <option value="">未分类</option>
      {folders.map((value) => <option key={value} value={value}>{value}</option>)}
    </select>
  </div>
</label>
```

Initialize and submit the folder through `resolveSelectedFolder(folders, requestedFolder)` so unavailable values always fall back to `""`.

- [ ] **Step 8: Replace the read-only summary strip with an editable field and button**

Render for every snippet, including new entries:

```tsx
<label className="native-field summary-field">
  <span>总结 <small>最多 10 字</small></span>
  <div className="summary-control">
    <input value={summary} onChange={(event) => setSummary(limitChars(event.target.value))} placeholder="例如 售后夸赞" />
    <button type="button" onClick={() => void summarize()} disabled={summarizing || !secret.trim()}>
      {summarizing ? "总结中…" : "AI 总结"}
    </button>
  </div>
  {summaryError && <small className="summary-error" role="status">{summaryError}</small>}
</label>
```

Track the latest content and summary in refs. `summarize()` captures the current trimmed content, awaits `aiSummary`, then calls `resolveGeneratedSummary(captured, latestContentRef.current.trim(), latestSummaryRef.current, generated)`. Apply the returned summary/error and always clear loading in `finally`.

- [ ] **Step 9: Style the controls without changing the visual system**

In `app/globals.css`, reuse existing surface, border, focus-ring, font, radius, and motion values. Required geometry:

- `.directory-heading`: label and 24×24 plus button on one row.
- `.folder-create-dialog`: maximum width 340px with the current editor shadow and 16–18px radius.
- `.folder-select`: 42px high and aligned with `.soft-input`.
- `.summary-field`: 12px top margin.
- `.summary-control`: two-column `minmax(0,1fr) auto`; input 42px high; AI button no-wrap and at least 82px wide.
- At `max-width: 640px`, title/directory stack and summary controls remain on one row where possible; at narrow widths allow the AI button below the input without hiding it.

- [ ] **Step 10: Run focused tests, full automated checks, and build**

Run: `node --test tests/clipbox-core.test.mjs && npm test && npm run lint && npm run build`

Expected: all tests pass, lint exits 0, and build exits 0.

- [ ] **Step 11: Commit Task 3 files only**

```bash
git add app/clipbox-core.ts app/page.tsx app/globals.css tests/clipbox-core.test.mjs
git commit -m "feat: add manual AI summaries and directory picker"
```

---

### Task 4: Documentation, Behavior QA, and Desktop Verification

**Files:**
- Modify: `README.md`
- Verify only: `app/page.tsx`, `app/globals.css`, `desktop/main.cjs`

**Interfaces:**
- Consumes: completed application from Tasks 1–3.
- Produces: accurate user documentation and verified browser/Electron behavior; no new feature surface.

- [ ] **Step 1: Update README behavior copy**

Replace the two obsolete bullets with exact behavior:

```md
- 话术总结可手动填写；点击“AI 总结”后会在本机生成十字以内总结，生成后仍可修改
- 左侧目录导航；在侧栏创建目录，并在新增或编辑弹窗中下拉选择目录
```

- [ ] **Step 2: Run the full automated verification suite**

Run: `npm test && npm run lint && npm run build`

Expected: every command exits 0 with no test failures or lint errors.

- [ ] **Step 3: Verify browser behavior at both target sizes**

Start `npm run dev`, then inspect the real local page at `680 × 620` and `500 × 520`. Verify:

1. Create an empty snippet directory; confirm it remains visible with count 0.
2. Open a new snippet editor; choose the directory from the select.
3. Type a summary manually; save and confirm the list subtitle updates.
4. Reopen, change content, click “AI 总结”, edit the result, and save.
5. Trigger AI summary and change content before it finishes; confirm the stale result is ignored.
6. Confirm “保存” and “保存并复制” remain reachable and do not wrap.
7. Confirm secret editing still supports hidden/plain content and directory selection.
8. Enable reduced motion and confirm no essential feedback depends on animation.

- [ ] **Step 4: Package and smoke-test the Electron App**

Run: `npm run desktop:pack`

Expected: exit 0 and `release/mac-arm64/Clipbox.app` exists. Launch it, verify the title bar remains draggable, the traffic lights are correctly positioned, the new dialogs fit the production window, and no port-conflict error appears.

- [ ] **Step 5: Commit documentation only**

```bash
git add README.md
git commit -m "docs: describe manual summaries and directory selection"
```

---

## Final Verification

- Run `npm test`, `npm run lint`, `npm run build`, and `npm run desktop:pack` from a clean worktree state.
- Inspect the final Git diff and confirm only `app/clipbox-core.ts`, `app/page.tsx`, `app/globals.css`, `tests/clipbox-core.test.mjs`, `package.json`, and `README.md` changed for the feature.
- Confirm no credentials, device keys, vault contents, generated release binaries, `dist`, `.next`, `.wrangler`, or `node_modules` are staged.
- Use `superpowers:requesting-code-review`, address Critical/Important findings, then run `superpowers:verification-before-completion` before claiming completion.
