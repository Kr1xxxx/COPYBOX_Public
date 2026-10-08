# Remember Window Bounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Clipbox's last valid normal-window position and size after reopening or refreshing the application.

**Architecture:** A focused CommonJS state store validates display visibility and reads/writes one JSON file under Electron `userData`. The Electron main process owns window events and applies debounced persistence while excluding quick-search mode.

**Tech Stack:** Electron 37, Node.js CommonJS, Node test runner

## Global Constraints

- Keep the existing `500 × 520` minimum and `680 × 620` default window size.
- Do not add dependencies.
- Do not persist quick-search temporary bounds.
- Fall back safely when saved bounds are invalid or off every connected display.

---

### Task 1: Window State Store

**Files:**
- Create: `desktop/window-state.cjs`
- Create: `tests/window-state.test.mjs`

**Interfaces:**
- Consumes: a JSON path and a `getWorkAreas()` callback returning `{ x, y, width, height }[]`
- Produces: `createWindowStateStore({ filePath, getWorkAreas })` with `load()` and `save(bounds)` methods

- [ ] **Step 1: Write failing tests** for restoring visible bounds, rejecting off-screen or malformed bounds, and reading back a saved JSON state.
- [ ] **Step 2: Run `node --test tests/window-state.test.mjs`** and confirm failure because the store does not exist.
- [ ] **Step 3: Implement the store** with finite numeric validation, `500 × 520` minimums, bounded maximums, an `80 × 80` visibility threshold, and atomic temporary-file replacement.
- [ ] **Step 4: Run `node --test tests/window-state.test.mjs`** and confirm all focused tests pass.
- [ ] **Step 5: Commit** the design, plan, test, and store as `feat: persist validated window bounds`.

### Task 2: Electron Window Integration

**Files:**
- Modify: `desktop/main.cjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/desktop-runtime.test.mjs`

**Interfaces:**
- Consumes: `createWindowStateStore({ filePath, getWorkAreas })`
- Produces: persisted normal bounds on move, resize, quit, and relaunch; restored bounds in `createWindow()`

- [ ] **Step 1: Add a failing runtime source test** asserting the desktop main process loads the store, listens for move/resize, skips quick mode, and saves before relaunch.
- [ ] **Step 2: Run the focused runtime test** and confirm the new assertions fail.
- [ ] **Step 3: Integrate the store** using Electron `screen`, a 180 ms debounce, `getNormalBounds()`, and immediate flush on close/relaunch/before-quit.
- [ ] **Step 4: Bump the application version** from `0.2.7` to `0.2.8`.
- [ ] **Step 5: Run focused tests** and confirm they pass.
- [ ] **Step 6: Commit** as `feat: restore the previous window position`.

### Task 3: Full Verification and Installation

**Files:**
- Verify only

**Interfaces:**
- Consumes: packaged Clipbox v0.2.8
- Produces: installed and behavior-verified `/Applications/Clipbox.app`

- [ ] **Step 1: Run `npm test` and `npm run lint`** with zero failures.
- [ ] **Step 2: Run `npm run desktop:pack`** and verify the packaged app exists.
- [ ] **Step 3: Back up v0.2.7, install v0.2.8, then launch it.**
- [ ] **Step 4: Move and resize the real window, quit and reopen, and verify exact persisted bounds.**
- [ ] **Step 5: Restore the original `2307,107 / 680 × 620` bounds and leave the normal app running.**
