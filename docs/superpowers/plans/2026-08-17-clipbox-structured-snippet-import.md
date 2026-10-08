# Clipbox Structured Snippet Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize the 160-row cross-border messaging workbook, add local XLSX/CSV import and structured snippet behavior to Clipbox, then import and verify the library in the desktop app.

**Architecture:** Keep `SecretItem` and the encrypted `VaultData` envelope as the persistence boundary, adding optional `snippetMeta` only for structured snippets. Put pure normalization, parsing, search, deduplication, and placeholder substitution in a focused `app/snippet-import.ts` module; keep file selection, preview, persistence, and dialogs in `app/page.tsx`. Use SheetJS `xlsx` 0.18.5 for local browser parsing and the bundled spreadsheet artifact runtime only to generate and visually verify the cleaned workbook.

**Tech Stack:** TypeScript 5.9, React 19, browser Web Crypto/localStorage, SheetJS `xlsx` 0.18.5, Node test runner, bundled spreadsheet artifact runtime, Electron 37.

## Global Constraints

- Do not modify `/Users/xiaopeiyang/Desktop/跨境电商即时消息话术库_160条_含使用规则.xlsx`.
- Generate `/Users/xiaopeiyang/Desktop/跨境电商即时消息话术库_Clipbox导入版.xlsx` with `Clipbox导入`, `需人工复核`, and `字段说明` sheets.
- Keep the existing compact macOS window, sidebar, list, encryption envelope, old vault data, and old JSON backups compatible.
- Parse XLSX and CSV locally; never upload workbook contents.
- Import spreadsheets by merge only; never allow spreadsheet import to replace secrets or the whole vault.
- Keep English as the default copied text and Chinese as a separately available copy action.
- Require all actual square-bracket placeholders before final copy; treat declared but unused variables as checklist items.
- `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 2`, `VISUAL_DENSITY: 8`.
- Do not expose passwords, device keys, encrypted payloads, tokens, or cookies in logs or generated files.

---

### Task 1: Structured snippet contracts and pure normalization

**Files:**
- Modify: `app/clipbox-core.ts`
- Create: `app/snippet-import.ts`
- Modify: `tests/clipbox-core.test.mjs`
- Create: `tests/snippet-import.test.mjs`

**Interfaces:**
- Produces: `SnippetMeta`, `SnippetPriority`, `SnippetImportRow`, `SnippetImportPreview`.
- Produces: `extractPlaceholders(text: string): string[]`.
- Produces: `normalizeSnippetRow(row: Record<string, unknown>, sourceRow: number): SnippetImportRow`.
- Produces: `buildSnippetImportPreview(rows: Record<string, unknown>[], current: SecretItem[], createId: () => string, now: number): SnippetImportPreview`.
- Produces: `snippetSearchText(item: SecretItem): string` and `fillSnippetTemplate(text: string, values: Record<string, string>): { text: string; missing: string[] }`.

- [ ] **Step 1: Write failing type and behavior tests**

Add literal fixtures proving that `[Customer Name]` is extracted once across English and Chinese, a declared `Price` without a bracket becomes a required input, product text maps to fixed product groups, missing English is reported as an error, duplicate type/title/English is skipped, structured Chinese/product text is searchable, and substitution refuses missing values.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test tests/clipbox-core.test.mjs tests/snippet-import.test.mjs`

Expected: FAIL because `snippet-import.ts`, `SnippetMeta`, and the new functions do not exist.

- [ ] **Step 3: Implement the minimum pure functions**

Extend `SecretItem` with `snippetMeta?: SnippetMeta`. Implement column validation, trimming, exact duplicate signatures, fixed product mappings, placeholder extraction, required-input splitting, verification detection, search text, and literal bracket replacement without browser APIs.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `node --test tests/clipbox-core.test.mjs tests/snippet-import.test.mjs`

Expected: all focused tests pass with zero failures.

- [ ] **Step 5: Commit**

```bash
git add app/clipbox-core.ts app/snippet-import.ts tests/clipbox-core.test.mjs tests/snippet-import.test.mjs
git commit -m "feat: add structured snippet normalization"
```

### Task 2: Local XLSX/CSV parsing and import preview

**Files:**
- Modify: `package.json`
- Add: `package-lock.json`
- Modify: `app/snippet-import.ts`
- Modify: `tests/snippet-import.test.mjs`

**Interfaces:**
- Consumes: `normalizeSnippetRow` and `buildSnippetImportPreview` from Task 1.
- Produces: `parseSnippetWorkbook(buffer: ArrayBuffer, fileName: string): Record<string, unknown>[]`.
- Produces: `REQUIRED_SNIPPET_COLUMNS` and user-readable `SnippetImportError` messages.

- [ ] **Step 1: Install the pinned parser dependency**

Run: `npm install xlsx@0.18.5 --save-exact`

Expected: `package.json` and `package-lock.json` record exactly `xlsx: 0.18.5`.

- [ ] **Step 2: Write failing parser tests**

Build an in-memory workbook with SheetJS containing a `话术库` sheet and literal Chinese headers. Assert selection of `话术库`, CSV parsing, required-column rejection, empty-row removal, and preservation of all 12 source columns.

- [ ] **Step 3: Run parser tests and confirm RED**

Run: `node --test tests/snippet-import.test.mjs`

Expected: FAIL because `parseSnippetWorkbook` is not implemented.

- [ ] **Step 4: Implement local workbook parsing**

Use `XLSX.read(buffer, { type: "array", cellDates: false })`; prefer `话术库`, otherwise find the first sheet containing every required column. Use `sheet_to_json` with `defval: ""`, reject unsupported extensions, and never send data across the network.

- [ ] **Step 5: Run parser tests and confirm GREEN**

Run: `node --test tests/snippet-import.test.mjs`

Expected: all parser and normalization tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app/snippet-import.ts tests/snippet-import.test.mjs
git commit -m "feat: parse local snippet spreadsheets"
```

### Task 3: Import, search, and copy interactions

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/clipbox-core.test.mjs`

**Interfaces:**
- Consumes: `parseSnippetWorkbook`, `buildSnippetImportPreview`, `snippetSearchText`, `fillSnippetTemplate`.
- Produces: a spreadsheet file input accepting `.xlsx,.csv`, an `ImportPreviewDialog`, and a `SnippetCopyDialog`.
- Produces: merged `VaultData` persisted through the existing encrypted `persist` queue.

- [ ] **Step 1: Write failing state-behavior tests**

Add pure core tests for high-priority ranking after pinned items, product-filter inclusion, and copy readiness when placeholders or verification confirmation are missing.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test tests/clipbox-core.test.mjs tests/snippet-import.test.mjs`

Expected: FAIL because ranking/filter/copy-readiness helpers are absent.

- [ ] **Step 3: Implement and pass the pure helpers**

Add `matchesSnippetProduct`, `structuredSnippetRank`, and `snippetCopyReadiness` to `snippet-import.ts`, use them from `page.tsx`, then re-run the focused tests until green.

- [ ] **Step 4: Implement spreadsheet selection and preview**

Add a separate hidden file input and menu action “导入话术表格”. Parse locally, show total/importable/duplicate/error counts, created directories, row errors, and five preview rows. Confirming merges new items and folders through `persist`, switches to the snippet tab, and reports the imported count.

- [ ] **Step 5: Implement structured search and compact product filter**

Search `snippetSearchText(item)` in addition to existing fields. Add one compact product popover beside the search field only in the snippet tab; default to “全部产品”. Keep unstructured snippets visible only under the default product filter.

- [ ] **Step 6: Implement structured copy behavior**

Keep one-click English copy when no variables or warnings exist. Otherwise open `SnippetCopyDialog` with placeholder inputs, required-input checklist, verification confirmation, English preview, Chinese copy action, keyboard focus trapping, Esc close, visible disabled state, and existing copied feedback after success.

- [ ] **Step 7: Extend the existing editor without breaking ordinary snippets**

For structured snippets, show editable Chinese, scene/action, raw product, usage note, and priority in a compact disclosure. Preserve `snippetMeta` and `note` on save. Do not truncate structured `action`; continue limiting ordinary manual summaries to 10 characters.

- [ ] **Step 8: Run focused tests and build**

Run: `node --test tests/clipbox-core.test.mjs tests/snippet-import.test.mjs && npm run build`

Expected: tests pass and the production build exits 0.

- [ ] **Step 9: Commit**

```bash
git add app/page.tsx app/globals.css app/snippet-import.ts tests/clipbox-core.test.mjs
git commit -m "feat: import and use structured snippets"
```

### Task 4: Generate and verify the normalized workbook

**Files:**
- Read: `/Users/xiaopeiyang/Desktop/跨境电商即时消息话术库_160条_含使用规则.xlsx`
- Create: `/Users/xiaopeiyang/Desktop/跨境电商即时消息话术库_Clipbox导入版.xlsx`
- Temporary only: `/tmp/clipbox-snippet-import/*`

**Interfaces:**
- Consumes: the source `话术库!A1:L161` rows and the exact normalization rules from Task 1.
- Produces: three sheets named `Clipbox导入`, `需人工复核`, and `字段说明`.

- [ ] **Step 1: Read source rows with the bundled spreadsheet artifact runtime**

Assert 160 data rows, 12 source columns, 13 stages, and unique English text before creating output.

- [ ] **Step 2: Create the cleaned workbook without changing the source**

Write 160 normalized rows with source row, label, folder, English, Chinese, scene, action, product groups, raw product, placeholders, required inputs, usage note, priority, and verification flag. Add the two high-similarity pairs and all variable-declaration mismatches to `需人工复核`; add field definitions and product mappings to `字段说明`.

- [ ] **Step 3: Format the workbook**

Freeze header rows, enable filters, set readable widths, wrap long message columns, use restrained header fills, and keep source text unchanged.

- [ ] **Step 4: Re-read and render for verification**

Confirm exact sheet names, 160 import rows, no empty English messages, 13 folders, and expected priority/placeholder counts. Render each sheet and visually inspect at full size and common viewing scale.

### Task 5: Import into the desktop app and complete verification

**Files:**
- Runtime data only: Electron profile local encrypted vault.
- No manual edits to Chromium Local Storage or encryption keys.

**Interfaces:**
- Consumes: the Task 4 workbook and the Task 3 UI.
- Produces: 160 structured snippets merged into the current device vault.

- [ ] **Step 1: Start the production Electron app with a temporary debugging port**

Build and launch the real app profile. Use the Chrome DevTools Protocol only to drive the visible file input and dialog controls; never read or print localStorage, passwords, device keys, or encrypted values.

- [ ] **Step 2: Perform the import through the shipped UI**

Choose the normalized workbook, check the preview reports 160 importable rows and 13 directories, then confirm merge import.

- [ ] **Step 3: Verify observable app behavior**

Check the话术 count, all 13 directories, English/Chinese search, product filtering, a no-variable one-click copy, a placeholder-gated copy, and a verification-warning copy.

- [ ] **Step 4: Run the complete engineering gate**

Run: `npm test && npm run lint && npm run build`

Expected: all tests pass, lint reports zero errors, and build exits 0.

- [ ] **Step 5: Inspect final diffs and requirement coverage**

Review only intended tracked files, confirm unrelated untracked user files remain untouched, and compare every design-spec success criterion against fresh test, workbook, and desktop evidence.

- [ ] **Step 6: Commit final verification fixes if any**

```bash
git add app/clipbox-core.ts app/snippet-import.ts app/page.tsx app/globals.css package.json package-lock.json tests/clipbox-core.test.mjs tests/snippet-import.test.mjs
git commit -m "test: verify structured snippet import"
```
