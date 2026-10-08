# Category Color Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every directory category one consistent marker color across its cards and sidebar entry.

**Architecture:** A pure helper builds a deterministic folder-name-to-color map from a fixed muted palette, independent of directory display order. The existing page derives one map per active library and uses it for both card and sidebar markers without changing encrypted vault data.

**Tech Stack:** React 19, TypeScript, CSS, Electron, Node test runner

## Global Constraints

- Category means the item's `folder` value.
- Same folder always has the same color in one folder set.
- Different folders use different colors until the 20-color palette is exhausted.
- Directory reordering does not change colors.
- Unclassified items use neutral `#C7C7CC`.
- Existing `item.color` remains stored for compatibility but does not render the category marker.
- Ship as version `0.2.10` without new dependencies.

---

### Task 1: Deterministic Category Palette

**Files:**
- Create: `app/category-colors.ts`
- Create: `tests/category-colors.test.mjs`

**Interfaces:**
- Consumes: `readonly string[]` folder names.
- Produces: `buildCategoryColorMap(folderNames): Record<string, string>` and `UNCATEGORIZED_COLOR`.

- [ ] **Step 1: Write failing tests** for same-name consistency, 13 distinct current directory colors, unchanged mapping after reorder, duplicate normalization, and neutral fallback constant.
- [ ] **Step 2: Run `node --test tests/category-colors.test.mjs`** and confirm failure because the module does not exist.
- [ ] **Step 3: Implement the helper** with a 20-entry muted palette, deterministic string hash, code-point sorting, and linear collision resolution.
- [ ] **Step 4: Run the focused test** and confirm all palette tests pass.
- [ ] **Step 5: Commit** as `feat: assign stable colors to categories`.

### Task 2: Shared Card and Sidebar Rendering

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/category-colors.test.mjs`

**Interfaces:**
- Consumes: `buildCategoryColorMap(activeFolders)` and `UNCATEGORIZED_COLOR`.
- Produces: matching inline colors on `.drag-handle i` and `.directory-color-marker`.

- [ ] **Step 1: Add a failing integration-source assertion** that cards no longer render `item.color` and both marker locations use `categoryColors`.
- [ ] **Step 2: Run the focused test** and confirm the source assertion fails.
- [ ] **Step 3: Integrate the shared map** through `useMemo`, replace the card marker source, add the directory marker element, and style its fixed geometry.
- [ ] **Step 4: Bump package versions** from `0.2.9` to `0.2.10`.
- [ ] **Step 5: Run focused tests** and confirm they pass.
- [ ] **Step 6: Commit** as `feat: show category colors in the library`.

### Task 3: Verify, Package, and Install

**Files:**
- Verify only

**Interfaces:**
- Consumes: packaged Clipbox v0.2.10.
- Produces: installed `/Applications/Clipbox.app` with visually verified category colors.

- [ ] **Step 1: Run `npm test` and `npm run lint`** with zero failures.
- [ ] **Step 2: Run `npm run desktop:pack`** successfully.
- [ ] **Step 3: Back up v0.2.9 and install v0.2.10.**
- [ ] **Step 4: Verify in the real renderer** that the current 13 directories have distinct sidebar colors, cards match their selected directory, unclassified fallback is neutral, and copy success remains green.
- [ ] **Step 5: Capture and inspect a full-size screenshot** and leave the normal app running at its stored window bounds.
