# Remove Chinese Card Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the card-level Chinese shortcut and make the remaining primary copy control smaller.

**Architecture:** Delete the renderer element and all dedicated layout/style branches instead of hiding them. Collapse every card back to pin, optional preparation, and one compact primary copy action.

**Tech Stack:** React 19, CSS, Electron, Chrome DevTools Protocol, Node test runner.

## Global Constraints

- Zero `.native-chinese` elements may remain.
- Primary copy remains accessible and copies the English message.
- Copy button measures exactly 28×28 pixels with a 10×13 glyph and 1.5-pixel stroke.
- No card-height, typography, drag, pin, or preparation changes.
- No new dependency.
- Ship as version `0.2.7`.

---

### Task 1: Establish the UI regression test

**Files:**
- Inspect: installed `/Applications/Clipbox.app`

**Interfaces:**
- Observes: `.native-chinese`, `.native-copy`, and `.copy-glyph` in the real renderer.

- [ ] **Step 1: Run a failing CDP assertion**

Launch the installed app with remote debugging and assert that `.native-chinese` count equals `0` and `.native-copy` is 28×28. Expected before implementation: FAIL because v0.2.6 renders the Chinese action and a 32×32 copy button.

### Task 2: Remove and compact the card actions

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Removes: `has-chinese` card class and `.native-chinese` element/styles.
- Produces: `.native-copy` at 28×28 with the existing English-copy click handler and accessible label.

- [ ] **Step 1: Delete the Chinese action**

Remove the conditional `has-chinese` class and the `native-chinese` button from the card JSX. Remove its grid columns, hover rules, copied-state selector, and component styles.

- [ ] **Step 2: Compact the primary copy UI**

Use 36 pixels for the trailing grid column, set `.native-copy` to 28×28, and set the double-page glyph to 10×13 with a 1.5-pixel border. Recenter both glyph layers within the smaller button.

- [ ] **Step 3: Bump the patch version**

Change the root package version from `0.2.6` to `0.2.7` in `package.json` and the two root package-lock entries.

- [ ] **Step 4: Run full verification**

Run `npm test`, `npm run lint`, and `npm run desktop:pack`. All must exit 0.

- [ ] **Step 5: Install and verify GREEN**

Back up v0.2.6, install v0.2.7, then rerun the CDP assertion at 680×620 and 500×520. Confirm zero Chinese buttons, exact copy-button dimensions, working English copy, and no horizontal overflow.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/globals.css package.json package-lock.json
git commit -m "fix: simplify snippet card copy action"
```
