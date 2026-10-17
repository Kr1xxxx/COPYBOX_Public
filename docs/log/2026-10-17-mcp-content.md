# MCP snippet batches and local image operations

- Date: 2026-10-17 · Thread/agent: Codex MCP interface
- What changed: Added 10 MCP tools for reading snippet folders, batch snippet reads/updates, image metadata/import/previews and image folder organization. Reuses existing vault and image-library persistence without changing storage formats, UI or account permissions. Snippet batches validate before one save; images report per-item outcomes, deduplicate imports and refuse overlapping MCP image operations without blocking snippets.
- User-visible change (plain Chinese, for the preview changelog): 连接 Codex 后，可以批量整理话术、导入本机图片并整理图片目录。
- Verification: Synthetic adapter tests and browser flows cover persistence/reload, stale versions, duplicate images, partial failures and bounded previews; existing secret consent regressions retained. Final check results are recorded in the PR.
- Not done / risks: Native Rust compile/tests require CI (no local Rust toolchain). Installed-app acceptance is not performed. Image version checks use existing store operations, not compare-and-swap against simultaneous UI edits; a multi-field image edit can partially succeed. Timeout outcomes must be queried before retrying. No account data, installed app, Codex configuration or release version is changed.
- Next step: Review CI and request owner approval before merging the save-path extension; no release or installation is included.
