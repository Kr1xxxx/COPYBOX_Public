# Remove Snippet Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove snippet priority from imported metadata, persisted vault data, editor UI, and unused ranking code.

**Architecture:** Treat priority as a retired metadata field. New normalization never creates it, vault normalization strips legacy copies, and the editor renders and saves only the remaining structured metadata.

**Tech Stack:** TypeScript, React 19, CSS, Node test runner, Electron.

## Global Constraints

- No user-visible priority badge, label, selector, or sorting remains.
- Legacy vaults continue to open; only the retired `priority` property is removed.
- Spreadsheet source columns remain readable, but the priority value is ignored.
- No new dependency.

---

### Task 1: Remove priority from the metadata contract

**Files:**
- Modify: `tests/snippet-import.test.mjs`
- Modify: `tests/clipbox-core.test.mjs`
- Modify: `app/clipbox-core.ts`
- Modify: `app/snippet-import.ts`

**Interfaces:**
- Produces: `SnippetMeta` without `priority`.
- Removes: `SnippetPriority`, `structuredSnippetRank`, and priority normalization.

- [ ] **Step 1: Write failing tests**

Assert that `normalizeSnippetRow()` does not include `priority`, even when the source row contains `优先级: "高"`. Add a legacy vault fixture whose `snippetMeta` contains `priority: "高"` and assert that `normalizeVaultData()` removes only that property.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/snippet-import.test.mjs tests/clipbox-core.test.mjs
```

Expected: FAIL because imported and normalized metadata still contains `priority`.

- [ ] **Step 3: Implement the metadata removal**

Delete `SnippetPriority` and `SnippetMeta.priority`. Remove priority parsing and `structuredSnippetRank`. Before numbering vault items, clone structured metadata and delete a possible legacy `priority` property.

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test tests/snippet-import.test.mjs tests/clipbox-core.test.mjs
```

Expected: both files pass.

### Task 2: Remove priority from the editor

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: priority-free `SnippetMeta` from Task 1.
- Produces: priority-free structured editor and v0.2.4 desktop package.

- [ ] **Step 1: Remove editor state and controls**

Delete the priority state, save assignment, summary badge, and select field. Render “产品 / 业务” as a normal full-width field and remove unused priority/grid CSS.

- [ ] **Step 2: Bump the patch version**

Change `0.2.3` to `0.2.4` in `package.json` and the two root package-lock version entries.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test
npm run lint
npm run desktop:pack
```

Expected: all tests pass, Lint exits 0, and Electron packaging exits 0.

- [ ] **Step 4: Install and smoke test**

Install v0.2.4, open a structured snippet, expand “中文对照与使用规则”, and confirm no DOM text or select option contains “优先级”. Inspect 680×620 and 500×520 layouts for empty columns or horizontal overflow.

- [ ] **Step 5: Commit**

```bash
git add app/clipbox-core.ts app/snippet-import.ts app/page.tsx app/globals.css tests/clipbox-core.test.mjs tests/snippet-import.test.mjs package.json package-lock.json
git commit -m "feat: remove snippet priority"
```
