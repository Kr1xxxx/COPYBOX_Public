# page.tsx split step 2: folder row and empty state; two more source-text tests become behaviour tests

- Date: 2026-10-10 · Thread/agent: 【工程】 (advisor item 15)
- What changed: the sidebar folder row moved to `app/folder-row.tsx` and the list's empty/onboarding panel to
  `app/list-empty-state.tsx`; the markup is the same, state and handlers stay in `page.tsx` and are passed in as props.
  Only blocks that no open PR touches were moved (checked the diffs of #50, #52, #61, #62 first).
- Tests: "first run offers onboarding actions" (inline-ui) and "card and directory markers share the derived category
  color map" (category-colors) grepped `page.tsx`, which no longer holds that markup. They are replaced by
  `tests/e2e/list-ui-behaviour.e2e.mjs`: first run shows the three onboarding buttons and 新增第一条 opens the editor;
  a search with no hit shows the plain empty message; card dots use the same colours as the sidebar folder markers
  (grey for uncategorized). Checked that both fail when the code is broken (wrong marker colour, missing button).
- User-visible change: none
- Not done / risks: `page.tsx` is still ~1600 lines (the big handlers and the main JSX are still in `Home`); more
  splits wait until #50 / #61 land. The vault crypto helpers are still in `page.tsx`.
