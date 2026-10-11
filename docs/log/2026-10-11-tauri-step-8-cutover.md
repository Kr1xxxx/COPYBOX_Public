# Tauri step 8: remove Electron

- Date: 2026-10-11 · Thread/agent: 【工程】Tauri 迁移
- What changed: deleted `desktop/` and the electron packages and build settings from `package.json` (and the lock file); moved `clipbox-cli.cjs` to `tools/`; removed the Electron-only tests (ai, shared fetch, site icon, window state, flush request, automation server/bridge, clipboard, runtime, update check, idle) — their Rust counterparts are tested in `src-tauri/` (`cargo test`); tests that only read Electron source text now read `src-tauri/bridge.js` and `main.rs`; added a Rust test for the command-line launcher install. Docs, CI comments and the "owner decides" paths now point to `src-tauri/`. New decision D-034.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: irreversible for the code (history keeps it). The Tauri app has not been run on a real Windows or Mac machine (checklist in `/mnt/project-files/tauri/windows-checklist.md`). Staff must export from the old app before updating. Publishing the Tauri installer to staff is not part of this PR.
- Next step: Lock tests on a real machine, ships a last Electron release with 「导出到新版」, then the Tauri installer.
