# Minimal Copy Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card copy overlay with a compact, in-place copy/check control.

**Architecture:** Keep the existing `copiedId` state and clipboard flow. Change only card markup and CSS so feedback is rendered inside the existing button, while an off-screen live region preserves accessible confirmation.

**Tech Stack:** React 19, CSS, Electron, Node test runner

## Global Constraints

- Copy button is exactly 24×24 pixels.
- No visible `.copy-feedback` overlay remains.
- Pin and optional preparation actions remain visible during copied state.
- Copy behavior, 1.25-second timing, card height, and dependencies remain unchanged.
- Ship as version `0.2.9`.

---

### Task 1: Define the Compact Copy Contract

**Files:**
- Create: `tests/copy-button-ui.test.mjs`

**Interfaces:**
- Consumes: `app/page.tsx` and `app/globals.css` as rendered-component sources.
- Produces: regression assertions for markup and state styling.

- [ ] **Step 1: Write a test** that asserts the overlay is absent, the button contains its own check state, live-region confirmation remains, copied state does not hide sibling actions, and CSS defines 24×24 dimensions plus `:focus-visible`.
- [ ] **Step 2: Run `node --test tests/copy-button-ui.test.mjs`** and confirm failure against the current overlay implementation.

### Task 2: Implement the In-place Button

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: existing `copiedId`, `copy(item)`, and 1.25-second reset timer.
- Produces: one 24×24 `.native-copy` button that changes from `.copy-glyph` to `.copy-check`.

- [ ] **Step 1: Replace the overlay markup** with a dynamic button label, `.copy-check`, and `.copy-status` live region.
- [ ] **Step 2: Simplify copied-state CSS** so only the button changes, delete `.copy-feedback` and `copy-feedback` keyframes, add focus styling, and reduce the grid column.
- [ ] **Step 3: Bump package versions** from `0.2.8` to `0.2.9`.
- [ ] **Step 4: Run the focused test** and confirm it passes.
- [ ] **Step 5: Commit** as `fix: simplify the copy button feedback`.

### Task 3: Verify, Package, and Install

**Files:**
- Verify only

**Interfaces:**
- Consumes: packaged Clipbox v0.2.9.
- Produces: installed `/Applications/Clipbox.app` with visually verified copy feedback.

- [ ] **Step 1: Run `npm test` and `npm run lint`** with zero failures.
- [ ] **Step 2: Run `npm run desktop:pack`** successfully.
- [ ] **Step 3: Back up v0.2.8 and install v0.2.9.**
- [ ] **Step 4: Capture and inspect the normal state, then click copy and inspect the 24×24 success state with no overlay or card shift.**
