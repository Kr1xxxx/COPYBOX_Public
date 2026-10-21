# MCP updates never overwrite newer edits

- Date: 2026-10-21 · Thread/agent: 修復 · MCP 更新衝突保護
- What changed: `update_snippet` now requires `expectedUpdatedAt` and runs as a one-entry `update_snippets`
  (`src-tauri/src/mcp.rs`), so it gets the same CONFLICT check. `update_images` saves through a new
  `ImageStore.update` that checks the version and writes title + folder in one write inside the image write queue
  (`app/image-store.ts`, `app/image-library.ts`, `app/mcp-images.ts`); a UI edit between the check and the save now
  gives CONFLICT instead of being overwritten. `appliedFields` is gone (no partial updates any more).
- User-visible change (plain Chinese, for the preview changelog): 外部工具（MCP）修改话术或图片时，若内容刚被改过会提示冲突，不再覆盖新内容
- Not done / risks: MCP clients that call `update_snippet` without `expectedUpdatedAt` now get an input error and
  must read the snippet first. The `clipbox` command line `update` is unchanged (no version check).
- Next step: 无
