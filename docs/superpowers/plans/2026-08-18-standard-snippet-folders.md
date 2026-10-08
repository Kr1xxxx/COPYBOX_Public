# Standard Snippet Folders Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix Clipbox snippets to seven workflow-ordered folders, improve scoped search/list presentation, enforce the same folders through UI/import/CLI, and preserve all 160 snippets.

**Architecture:** Add one small snippet-folder policy module as the single source of truth. Keep secret folders on the existing flexible registry path, while normalizing only the snippet registry to the standard order. Reuse existing search and automation flows, adding validation at their input boundaries.

**Tech Stack:** TypeScript, React 19, Node test runner, Electron, existing Clipbox CLI.

**Spec:** `docs/superpowers/specs/2026-08-18-standard-snippet-folders-design.md`

---

### Task 1: Protect the standard-folder contract with tests

**Files:**
- Create: `app/snippet-folders.ts`
- Modify: `tests/clipbox-core.test.mjs`
- Modify: `tests/clipbox-automation.test.mjs`
- Modify: `tests/snippet-import.test.mjs`

1. Add failing tests for fixed order, legacy-name mapping, unknown-folder rejection, and vault normalization that never reintroduces old snippet directories.
2. Add failing automation tests proving add defaults to a standard directory and update/move reject a nonstandard directory without changing command shapes.
3. Add failing import tests proving old directory names map deterministically and unknown names become row errors.
4. Run the focused tests and confirm they fail for the missing behavior.

### Task 2: Implement the directory policy

**Files:**
- Create: `app/snippet-folders.ts`
- Modify: `app/clipbox-core.ts`
- Modify: `app/clipbox-automation.ts`
- Modify: `app/snippet-import.ts`

1. Define the seven ordered directories and legacy mappings.
2. Force the normalized snippet registry to that order while leaving item records and secret folders intact.
3. Validate/default automation folders at add/update/move boundaries.
4. Normalize import rows without creating unknown directories.
5. Run focused tests to green.

### Task 3: Update the product interface

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/category-colors.test.mjs`
- Modify: relevant UI tests if selectors require updates

1. In snippet mode render only “全部话术” plus the seven ordered directories and counts; retain the current flexible secret navigation.
2. Remove snippet folder creation/reordering, pinned and uncategorized entries.
3. Update the search placeholder and render title, Chinese summary, number, and compact English preview.
4. Make snippet editors require a standard directory, defaulting to the selected one or “询盘接待”.
5. Run UI-focused tests, build, and lint.

### Task 4: Safely normalize the existing titles

**Files:**
- Modify: encrypted local Clipbox data only through the installed CLI

1. Quit Clipbox and copy its full Application Support directory to a dated v0.2.17 backup; reopen it.
2. Capture a non-secret baseline of number/title/summary/folder and exact folder counts.
3. Update only titles lacking ` · ` to `原标题 · 当前总结`; abort if a summary is missing or the resulting title is invalid.
4. Read all snippets to detect exact or strong duplicate candidates; report numbers only and do not mutate them.
5. Confirm count, fixed numbers, folders, contents and per-directory totals remain unchanged.

### Task 5: Package and acceptance-test v0.2.18

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

1. Bump version to 0.2.18.
2. Run full tests, lint, production build and desktop packaging.
3. Back up the installed v0.2.17 application, install v0.2.18, launch it and exercise refresh.
4. Use one temporary numbered snippet to test add, get, update, move and delete, then verify status is 160 and counts are 22/29/24/21/22/20/22.
5. Verify searches by English, Chinese, number and title return expected records, and report changed files, evidence and any suspected duplicates or unresolved issues.
