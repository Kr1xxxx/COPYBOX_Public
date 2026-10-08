# Snippet Default Kind Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make snippets the default Clipbox view and replace the two visible kind tabs with one reversible kind toggle.

**Architecture:** Keep the behavior in the existing `ItemKind` domain by exporting a default constant and a pure toggle helper from `clipbox-core.ts`. The page consumes those values, while CSS converts the existing two-row switch container into a compact single-row control.

**Tech Stack:** TypeScript, React 19, CSS, Node test runner, Electron.

## Global Constraints

- Default content kind is exactly `snippet`.
- One visible control shows the current kind and switches to the other kind.
- Switching resets directory, product filter, search, and selected row exactly as the existing tabs do.
- No new dependency and no new transition or keyframe.

---

### Task 1: Default kind and reversible toggle

**Files:**
- Modify: `tests/clipbox-core.test.mjs`
- Modify: `app/clipbox-core.ts`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `DEFAULT_ITEM_KIND: ItemKind`
- Produces: `toggleItemKind(kind: ItemKind): ItemKind`

- [ ] **Step 1: Write the failing test**

Import `DEFAULT_ITEM_KIND` and `toggleItemKind`, then assert:

```js
assert.equal(DEFAULT_ITEM_KIND, "snippet");
assert.equal(toggleItemKind("snippet"), "secret");
assert.equal(toggleItemKind("secret"), "snippet");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/clipbox-core.test.mjs`

Expected: FAIL because the two exports do not exist.

- [ ] **Step 3: Write minimal implementation**

Add the constant and pure helper to `clipbox-core.ts`. Initialize `activeKind` with the constant. Replace the two tab buttons with one button that shows the active type and count, calls `toggleItemKind`, and preserves the four existing reset operations.

Change `.home-switch` to a 34px, one-row grid. Keep the existing button, active-state, badge, and press styles.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
node --test tests/clipbox-core.test.mjs
npm test
npm run lint
npm run desktop:pack
```

Expected: all tests pass, Lint exits 0, and Electron packaging exits 0.

- [ ] **Step 5: Install and smoke test**

Install the newly packed app over `/Applications/Clipbox.app`, launch it, and verify the initial label is “话术”, a trusted click changes it to “秘密”, a second click returns it to “话术”, and both 680×620 and 500×520 layouts have no horizontal overflow.

- [ ] **Step 6: Commit**

```bash
git add app/clipbox-core.ts app/page.tsx app/globals.css tests/clipbox-core.test.mjs
git commit -m "feat: make snippets the default view"
```
