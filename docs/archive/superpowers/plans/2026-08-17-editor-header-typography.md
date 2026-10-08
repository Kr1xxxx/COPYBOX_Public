# Editor Header Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a consistent typography hierarchy in the item editor header, especially the snippet type badge, fixed number, title, and description.

**Architecture:** Fix the missing global font tokens and refine only the existing editor-header CSS selectors. Preserve the current React structure and validate the resulting computed styles in the packaged Electron application.

**Tech Stack:** CSS, React 19, Electron, Chrome DevTools Protocol.

## Global Constraints

- Type badge is 9px, fixed number is 10px, title is 20px, and description is 10px.
- Fixed numbers use the system monospace stack; all other header copy uses the system sans-serif stack.
- No editor form fields, data handling, dialog behavior, or animations change.
- No new dependency.

---

### Task 1: Repair font tokens and header hierarchy

**Files:**
- Modify: `app/globals.css`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: existing `.editor-head`, `.editor-kind`, and `.editor-snippet-number` markup.
- Produces: stable `--font-geist-sans` and `--font-geist-mono` CSS tokens plus the four-level header typography scale.

- [ ] **Step 1: Establish the failing visual baseline**

Open an imported snippet in the installed v0.2.2 application and read the computed style of `.editor-snippet-number`.

Expected failing baseline: its computed font size is inherited rather than the declared 9px because `--font-geist-mono` is undefined.

- [ ] **Step 2: Implement the CSS correction**

Define the two font tokens in `:root`. Set the header font family explicitly, use 9px for the type badge, 10px system mono for the number, 20px for the title, and 10px for the description. Use spacing rather than additional separators or decoration.

- [ ] **Step 3: Bump the patch version**

Change the package version from `0.2.2` to `0.2.3` in `package.json` and the two root occurrences in `package-lock.json`.

- [ ] **Step 4: Run repository verification**

Run:

```bash
npm test
npm run lint
npm run desktop:pack
```

Expected: all tests pass, Lint exits 0, and Electron packaging exits 0.

- [ ] **Step 5: Install and inspect the real dialog**

Install v0.2.3, open an imported snippet, and confirm the computed sizes are 9px, 10px, 20px, and 10px. Capture and inspect 680×620 and 500×520 screenshots with the header and form visible.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css package.json package-lock.json
git commit -m "fix: normalize editor header typography"
```
