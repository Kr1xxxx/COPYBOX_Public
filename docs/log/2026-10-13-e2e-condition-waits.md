# E2E tests wait for conditions instead of fixed pauses

- Date: 2026-10-13 · Thread/agent: W8 (worker, review item 15)
- What changed: Fixed `waitForTimeout` pauses in `layout-guard`, `image-grid`, `mini-tabs`, `main-flows`, `image-folders`
  and `seedSnippets` (helpers.mjs) were replaced by condition waits: animations finished, the page has stopped moving
  (a local `settle(page)` helper per file), counts reached, the vault written to storage. One deliberate pause stays
  (Ctrl+E must open nothing within 200 ms). The folder-drag flake in `main-flows` came from reading the Settings folder
  names with `innerText` in the frame before the collapsible panel turned from `visibility:hidden` to visible; the test
  now waits for the names to be visible and uses an auto-retrying `toHaveText`. `seedSnippets` now waits only for the
  row animation (the "已导入" toast may still show; since app/use-toast.ts a newer toast replaces it with its timer). The
  "folds the old card away" test samples from the moment the card starts folding until it is gone, not a fixed 500 ms.
- User-visible change: 无
- Not done / risks: the other e2e files (auto-backup, images, list-ui-behaviour, shared-library, ui-behaviour, usage-ranking) still have
  fixed waits. `settle` is copied into each file because helpers.mjs was out of scope; moving it there is a small follow-up.
- Next step: replace the remaining fixed waits the same way.
