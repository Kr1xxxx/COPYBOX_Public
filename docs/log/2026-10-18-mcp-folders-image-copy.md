# MCP snippet folders and image hover copy

- Date: 2026-10-18 · Thread/agent: Codex / Copyboxx MCP
- What changed: Added create_snippet_folder and rename_snippet_folder using the existing vault queue and directory rules. Existing custom snippet folders now work in add, update, move and batch-update commands. Main and mini image tiles reveal a text-labelled copy button on hover or keyboard focus; click uses the existing PNG copy path.
- User-visible change (plain Chinese, for the preview changelog): AI 工具可以新建、重命名自定义话术目录，标准目录保持保护；图片悬停显示「复制」按钮，完整窗口和迷你窗口均可使用。
- Verification: Build, lint, typecheck and 725 unit tests passed. 51 focused browser tests passed, including folder create/add/rename/reload, selection and pins, hover/focus copy, actual PNG bytes at the simulated native clipboard boundary and failure feedback. Inspected 680×620 and 360×440 screenshots. Full regression and native CI results are reported in the PR.
- Not done / risks: Local machine has no Rust toolchain; native MCP tests and Tauri builds run in CI. Not installed or released; platform verification stays false. Baseline full browser run had 363 passes and one pre-existing animation-time button-position assertion failure in automation-consent.e2e.mjs (1.52 px vs <1 px); its code/test was not changed. No concurrency feature, data cleanup or private settings change.
- Next step: Review and merge, then publish through the normal release process. Clients with a tool allowlist need create_snippet_folder and rename_snippet_folder after installing the new build.
