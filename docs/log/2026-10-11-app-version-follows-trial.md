# App version follows the trial version

- Date: 2026-10-11 · Thread/agent: 【工程】Tauri 迁移
- What changed: app version is now the trial version plus .0 (1.43.0), derived from `tools/preview/VERSION` by `scripts/sync-version.mjs`, run by `npm run tauri:build` and the Tauri CI workflow; `package.json`, lock file, `Cargo.toml` and `Cargo.lock` updated. New decision D-036.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: `VERSION` and the committed files can drift between builds (the build fixes it; a test checks the files agree with each other). Only `major.minor` trial numbers are supported.
- Next step: new Tauri test build shows v1.43.0 on the 关于 page.
