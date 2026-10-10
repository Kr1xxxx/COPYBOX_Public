# page.tsx split, step 1: small display pieces move to ui-atoms.tsx

- Date: 2026-10-09 · Thread/agent: 【工程】 (advisor item 15)
- What changed: `Icon` (with its path table), `Highlight`, `SnippetContent`, `SnippetTitle` and `VaultMark` moved unchanged
  from `app/page.tsx` to `app/ui-atoms.tsx` (65 lines out of page.tsx). Source-text tests read the new file through
  `tests/helpers/ui-source.mjs` (assertions unchanged). Chosen because nobody edits that part of the file
  (open PRs only touch imports and `Home`).
- User-visible change: 无
- Not done / risks: the vault crypto helpers (`encryptVault`, `deriveKey`, …) are the next pure block, but
  `tests/helpers/page-harness.mjs` extracts them from page.tsx by name, so moving them also means changing the
  harness and touches encryption code; left for a later PR that waits for Lock's 合并.
- Next step: pick the next block when no other PR touches it (page.tsx is still ~1500 lines, almost all in `Home`).
