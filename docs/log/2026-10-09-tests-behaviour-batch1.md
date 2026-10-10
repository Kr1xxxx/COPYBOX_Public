# Source-text tests, batch 1: six files become behaviour tests

- Date: 2026-10-09 · Thread/agent: 【工程】 (advisor item 15)
- What changed: `backup-ui`, `snippet-number-ui`, `copy-button-ui`, `card-marker-ui`, `editor-typography` and
  `product-filter-ui` (unit tests that grepped source text and CSS) are replaced by `tests/e2e/ui-behaviour.e2e.mjs`,
  which drives the page and reads what the browser computes. Same behaviour covered: snippet number only in the opened
  entry and the editor, no summaries/copy times in the list; 已复制 state announced as a status on a 28px green button with
  a visible focus ring, primary 复制 → 已复制; round 8px drag marker with focus ring; product filter menu really on top of
  the list; editor text area weight equals input weight; snippets and 秘密 exported as separate files (separate settings
  rows, no combined export, file `clipbox-snippets-….json` with `scope: "snippet"`; the 秘密 file is already covered in `backup.e2e.mjs`).
- Found while rewriting: the old `editor-typography` test asserted `font-weight: 620` on a rule that a later rule
  (`.inline-editor … textarea`, 500) overrides, so it checked dead CSS. The new test checks the weight people actually get (equal to the inputs, 500). Nothing in the app changed.
- User-visible change: 无
- Not done / risks: `inline-ui` and `settings-ui` still read source text (the settings threads are changing those files now);
  next batches go after their PRs merge. Weakened-test check: the tests are replaced, not removed, so CI may label this PR needs-owner.
- Next step: batch 2 = `inline-ui.test.mjs`, then `settings-ui.test.mjs`.
