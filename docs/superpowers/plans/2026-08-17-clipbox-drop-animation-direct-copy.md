# Clipbox Drop Animation and Direct Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight 220ms drag-drop layout transition and make every standard snippet copy action immediate while retaining variable preparation as an optional action.

**Architecture:** Keep pointer tracking and encrypted persistence unchanged. Add a focused FLIP hook that snapshots sortable DOM positions only immediately before pointer-driven reorders, then animates changed nodes with WAAPI after React commits the new layout. Move copy-path decisions into pure snippet helpers so the standard copy action always resolves source text directly and the existing preparation dialog is opened only by an explicit optional button.

**Tech Stack:** React 19, TypeScript, Web Animations API, CSS transforms, Node test runner, Electron 37.

## Global Constraints

- Do not add a dependency or execute animation work during initial loading.
- Animate only `transform`, for 220ms with `cubic-bezier(0.77, 0, 0.175, 1)`.
- Play layout motion only after pointer-driven card or directory reorders; keyboard ordering remains instant.
- Skip position motion when `prefers-reduced-motion: reduce` matches.
- English, Chinese, double-click, and search Enter copy paths must copy immediately even when placeholders or checks exist.
- Variable entry and checklist confirmation remain available through an explicit optional action.
- Preserve the 500px minimum-width layout without horizontal overflow.
- Bump the packaged application version from `0.2.0` to `0.2.1`.

---

### Task 1: Direct Copy With Optional Preparation

**Files:**
- Modify: `app/snippet-import.ts`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Test: `tests/snippet-import.test.mjs`

**Interfaces:**
- Produces: `resolveSnippetCopySource(item: SecretItem, language: "en" | "zh"): string`
- Produces: `hasOptionalSnippetPreparation(item: SecretItem): boolean`
- Consumes: the existing `SnippetCopyDialog` only from the new optional “填” button.

- [ ] **Step 1: Write failing copy-path tests**

Add literal expectations showing that a structured row with placeholders, required checks, and verification metadata still resolves its raw English and Chinese text immediately:

```js
test("resolves direct copy text without blocking on preparation metadata", () => {
  const item = normalizeSnippetRow(baseRow, 2).item;
  assert.equal(resolveSnippetCopySource(item, "en"), baseRow.英文即时消息);
  assert.equal(resolveSnippetCopySource(item, "zh"), baseRow.中文对照);
  assert.equal(hasOptionalSnippetPreparation(item), true);
  assert.equal(hasOptionalSnippetPreparation({ ...item, snippetMeta: undefined }), false);
});
```

This catches a regression that sends standard copying back through a required readiness gate.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --test tests/snippet-import.test.mjs
```

Expected: FAIL because both helper exports are absent.

- [ ] **Step 3: Implement minimal pure helpers**

In `app/snippet-import.ts`, implement:

```ts
export function resolveSnippetCopySource(item: SecretItem, language: "en" | "zh") {
  return language === "zh" ? item.snippetMeta?.chineseText || "" : item.secret;
}

export function hasOptionalSnippetPreparation(item: SecretItem) {
  const meta = item.snippetMeta;
  return Boolean(meta && (meta.placeholders.length || meta.requiredInputs.length || meta.requiresVerification));
}
```

- [ ] **Step 4: Route standard and optional copy actions separately**

In `app/page.tsx`:

- make `copy(item, language)` resolve the source and call `finishCopy` without setting `copyRequest`;
- add `prepareCopy(item, language)` that sets `copyRequest` explicitly;
- render a `native-prepare` button with visible text `填` only when `hasOptionalSnippetPreparation(item)` is true;
- keep `SnippetCopyDialog`, `fillSnippetTemplate`, and `snippetCopyReadiness` unchanged for the optional path;
- remove `copyRequest` from no-longer-relevant standard copy branches, but retain it in modal interaction state.

The card class must include `has-preparation` only when the optional button is rendered. Extend the existing CSS grids as follows without changing the main content minimum:

```css
.native-row.has-preparation {
  grid-template-columns: 28px minmax(0, 1fr) 30px 30px 43px;
}
.snippet-row.has-chinese.has-preparation {
  grid-template-columns: 28px minmax(0, 1fr) 30px 30px 30px 43px;
}
```

Style `native-prepare` as a restrained violet companion to the existing amber Chinese button and give it the title `填写变量后复制`.

- [ ] **Step 5: Verify focused behavior**

Run:

```bash
node --test tests/snippet-import.test.mjs
npm run lint
npm run build
```

Expected: all pass; the build contains no TypeScript or JSX errors.

- [ ] **Step 6: Commit direct copy**

```bash
git add app/snippet-import.ts app/page.tsx app/globals.css tests/snippet-import.test.mjs
git commit -m "feat: copy snippets directly with optional preparation"
```

### Task 2: Pointer Drop FLIP Animation

**Files:**
- Create: `app/reorder-animation.ts`
- Create: `app/use-sort-flip-animation.ts`
- Create: `tests/reorder-animation.test.mjs`
- Modify: `app/page.tsx`

**Interfaces:**
- Produces: `SortPosition = { left: number; top: number }`
- Produces: `buildFlipTransitions(before: Map<string, SortPosition>, after: Map<string, SortPosition>): Array<{ id: string; transform: string }>`
- Produces: `useSortFlipAnimation(): { prepareSortAnimation(scope: "card" | "folder"): void }`
- Consumes: sortable nodes with `data-sort-scope` and `data-sort-id` already rendered by `page.tsx`.

- [ ] **Step 1: Write failing FLIP calculation tests**

Create `tests/reorder-animation.test.mjs`:

```js
test("builds inverse transforms only for nodes whose layout position changed", () => {
  const before = new Map([
    ["a", { left: 20, top: 10 }],
    ["b", { left: 20, top: 70 }],
  ]);
  const after = new Map([
    ["a", { left: 20, top: 70 }],
    ["b", { left: 20, top: 10 }],
  ]);
  assert.deepEqual(buildFlipTransitions(before, after), [
    { id: "a", transform: "translate3d(0px, -60px, 0)" },
    { id: "b", transform: "translate3d(0px, 60px, 0)" },
  ]);
});

test("ignores stationary, removed, and newly inserted nodes", () => {
  const before = new Map([["same", { left: 4, top: 8 }], ["gone", { left: 0, top: 0 }]]);
  const after = new Map([["same", { left: 4, top: 8 }], ["new", { left: 0, top: 0 }]]);
  assert.deepEqual(buildFlipTransitions(before, after), []);
});
```

This catches sign errors, accidental animation of unchanged nodes, and attempts to animate nodes without both measurements.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --test tests/reorder-animation.test.mjs
```

Expected: FAIL because `app/reorder-animation.ts` does not exist.

- [ ] **Step 3: Implement the pure FLIP calculation**

Create `app/reorder-animation.ts` with exact delta semantics:

```ts
export type SortPosition = { left: number; top: number };

export function buildFlipTransitions(before: Map<string, SortPosition>, after: Map<string, SortPosition>) {
  return Array.from(after.entries()).flatMap(([id, current]) => {
    const previous = before.get(id);
    if (!previous) return [];
    const x = previous.left - current.left;
    const y = previous.top - current.top;
    return x === 0 && y === 0 ? [] : [{ id, transform: `translate3d(${x}px, ${y}px, 0)` }];
  });
}
```

- [ ] **Step 4: Implement the focused layout-animation hook**

Create `app/use-sort-flip-animation.ts` using `useCallback`, `useLayoutEffect`, and refs:

- `prepareSortAnimation(scope)` returns immediately for reduced motion;
- it snapshots `getBoundingClientRect().left/top` for matching sortable nodes;
- the next layout effect captures post-render positions and calls `buildFlipTransitions`;
- each changed element runs `element.animate([{ transform: inverse }, { transform: "translate3d(0, 0, 0)" }], { duration: 220, easing: "cubic-bezier(0.77, 0, 0.175, 1)" })`;
- retain each hook-owned `Animation` in a `WeakMap`, cancel only that animation before replacing it, and do not cancel unrelated row feedback animations;
- clear the pending snapshot after one layout effect.

- [ ] **Step 5: Animate pointer drop and rollback, not keyboard sorting**

In `app/page.tsx`:

- instantiate `prepareSortAnimation` once;
- add an `animate` boolean defaulting to false to `persistCardOrder` and `persistFolderOrder`;
- call `prepareSortAnimation("card")` or `prepareSortAnimation("folder")` before the optimistic `persist` only when `animate` is true;
- if persistence fails, prepare again before restoring the snapshot;
- pass `animate: true` only from the two pointer `onDrop` callbacks;
- leave `handleCardSortKey` and `handleFolderSortKey` on the default instant path.

- [ ] **Step 6: Verify animation code**

Run:

```bash
node --test tests/reorder-animation.test.mjs tests/pointer-reorder.test.mjs tests/clipbox-order.test.mjs
npm run lint
npm run build
```

Expected: all pass; lint accepts the layout-effect lifecycle and no dependency is added.

- [ ] **Step 7: Commit animation**

```bash
git add app/reorder-animation.ts app/use-sort-flip-animation.ts app/page.tsx tests/reorder-animation.test.mjs
git commit -m "feat: animate pointer drop reordering"
```

### Task 3: Version, Package, Install, and Real-App Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Generate: `release/mac-arm64/Clipbox.app` (ignored)
- Install: `/Applications/Clipbox.app`
- Preserve: `/Applications/Clipbox-备份-v0.2.0.app`

**Interfaces:**
- Produces: installed Clipbox `v0.2.1`.

- [ ] **Step 1: Bump the package version**

Change `package.json` from `0.2.0` to `0.2.1`, then run:

```bash
npm install --package-lock-only --ignore-scripts
```

Verify `package.json`, root `package-lock.json.version`, and `package-lock.json.packages[""].version` all equal `0.2.1`.

- [ ] **Step 2: Run the complete verification gate**

Run:

```bash
npm test
npm run lint
npm run desktop:pack
git diff --check
```

Expected: zero test failures, zero lint findings, and `release/mac-arm64/Clipbox.app` reports `CFBundleShortVersionString` `0.2.1`.

- [ ] **Step 3: Commit the version bump**

```bash
git add package.json package-lock.json
git commit -m "chore: bump Clipbox to 0.2.1"
```

- [ ] **Step 4: Back up and install safely**

- quit the running Clipbox process;
- move the existing `/Applications/Clipbox.app` to `/Applications/Clipbox-备份-v0.2.0.app` only if that backup path is absent;
- copy the packaged `release/mac-arm64/Clipbox.app` to `/Applications/Clipbox.app` with `ditto`;
- launch the new installed app normally after verification.

- [ ] **Step 5: Verify observable installed behavior**

Through the installed Electron window:

- click the normal copy button on a row with preparation metadata and assert clipboard feedback appears without `.snippet-copy-dialog`;
- click its `填` button and assert `.snippet-copy-dialog` opens and accepts variable/check input;
- drag one card and one directory, assert WAAPI reports a running transform animation with duration 220, wait for completion, and restore the original order;
- trigger `Option + ArrowDown` and assert no sort animation is created, then restore order;
- inspect settings for `版本 v0.2.1`;
- capture and inspect 680px and 500px screenshots, checking no horizontal overflow or clipped primary text;
- confirm no sortable node retains an inline transform after animations finish.

- [ ] **Step 6: Final repository and installation check**

Run:

```bash
git status --short
plutil -extract CFBundleShortVersionString raw /Applications/Clipbox.app/Contents/Info.plist
test -d /Applications/Clipbox-备份-v0.2.0.app
```

Expected: worktree clean, installed version `0.2.1`, backup present.
