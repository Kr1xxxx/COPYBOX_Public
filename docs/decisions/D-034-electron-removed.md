# D-034: Electron is removed; Tauri is the only desktop shell

- Date: 2026-10-11
- Context: D-029 moved the desktop app to Tauri to cut memory and installer size. Steps 2–7 brought the Tauri shell to
  parity (`docs/tauri-parity.md`); step 6 added the old-data move (D-032).
- Decision: step 8 deletes `desktop/` and the `electron` / `electron-builder` packages, the Electron-only tests and the
  local page server. `clipbox-cli.cjs` moves to `tools/`. Builds are `npm run tauri:build`. `src-tauri/` takes over
  `desktop/`'s place in the "owner decides" list (`scripts/classify-pr.mjs`) and the handoff-note check.
- Consequences: the last Electron release is the only way to export data for the move (设置 → 数据 → 导出到新版), so it
  must reach staff before they update. Releasing the Tauri installer to staff is a separate step that waits for the owner.
  Going back to Electron means restoring `desktop/` from git history (the branch `electron-last` keeps the last commit that still has Electron, d715231).
- Status: Accepted (owner: 「都合并」, 2026-10-11).
