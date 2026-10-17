# MCP snippets and images implementation plan

**Goal:** Extend the existing local MCP interface so AI clients can batch-edit snippets and import/organize images without UI automation.

**Approved scope:** Public repository only. MCP schemas, validation, adapters to existing application operations, and their tests/docs. No UI redesign, storage/encryption format or key changes, migrations, account tools expansion, installed-app replacement, or release.

**Architecture:** Keep stdio MCP → private local socket/named pipe → existing application write queue. Add isolated TypeScript command handlers and a bounded native image-file reader. Reuse existing snippet mutations and image-library operations. Never read application databases directly.

**Execution:** Inline integration with one isolated Rust implementer, followed by independent specification and quality review. Publish an explicit file allowlist against the verified public GitHub base; the local snapshot preparation commit is never pushed.

## Contract

- `list_snippet_folders` → `snippet-folders`: names and active counts, including empty standard folders.
- `get_snippets` → `get-many`: 1–100 distinct snippet numbers; return full contents and `updatedAt`.
- `update_snippets` → `update-many`: 1–100 distinct updates, each with `number`, required `expectedUpdatedAt`, and existing editable fields. Validate every entry before one persist; stale/missing/invalid input leaves all unchanged. Folder updates provide batch moves.
- `list_images` → `image-list`: optional folder/query and bounded offset/limit; active metadata only, never image bytes.
- `import_images` → `image-import`: 1–10 explicit absolute local paths, optional titles/folders. Native layer opens regular supported image files, caps each at 10 MiB and the batch at 20 MiB, then supplies `data` (base64), `mimeType`, and `sourceName` to the renderer. The transport request contains paths, not bytes. The renderer decodes/validates images and reuses `addImage`; byte-identical active images are reported as duplicates without creating a new entry. Per-file results describe success or failure; previously completed entries remain saved on a later failure. No remote compression/upload.
- `get_image_thumbnail` → `image-thumbnail`: exact image ID; return an MCP image content block for a bounded thumbnail, never an original-sized fallback.
- `update_images` → `image-update-many`: 1–100 distinct updates with `id`, required `expectedUpdatedAt`, and title/folder. Recheck each item, reuse rename/move, return per-item results including conflicts; no unsupported claim of cross-image atomicity.
- `list_image_folders` → `image-folders`; `create_image_folder` → `image-folder-create` (`name`); `rename_image_folder` → `image-folder-rename` (`from`, `to`). Reuse the application's current folder rules. No new permanent-delete tool.
- Existing MCP tools and secret permission gates remain compatible. No new tool reads account data.

## Tasks and checks

- [ ] Establish the public source snapshot and run baseline unit/build/browser checks; record environmental or existing failures.
- [ ] Add failing tests in `tests/mcp-snippets.test.mjs` for all-or-none validation, stale timestamps, duplicate numbers, bounds, folder counts and preserving unrelated records; implement `app/mcp-snippets.ts` by composing existing automation functions.
- [ ] Add failing tests in `tests/mcp-images.test.mjs` for paging, invalid imports, duplicates, stale edits, per-item errors and bounded previews; implement `app/mcp-images.ts` using existing image-store/library APIs.
- [ ] In `src-tauri/src/mcp.rs`, add typed schemas and mappings for the listed tools plus thumbnail image responses. Add Rust tests for schemas, invalid fields, booleans/numbers/arrays, existing tools, and thumbnail response conversion.
- [ ] Add `src-tauri/src/mcp_images.rs` with tests for invalid/non-absolute paths, directories, file signatures, byte limits and rejecting client-supplied prepared bytes. Wire only the image-import branch into the native automation bridge, and declare the module in `main.rs`.
- [ ] Integrate both TS handlers only at the existing automation callback in `app/page.tsx`; save snippets through `writeVault`, image operations through the current library. No change to UI commands or storage code.
- [ ] Add `tests/e2e/mcp-content.e2e.mjs`: invoke the automation callback on a clean browser profile with synthetic records, confirm snippet changes persist after reload, import a generated image, organize its folder, confirm duplicate suppression and obtain a small preview.
- [ ] Run `node --test tests/mcp-*.test.mjs`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run test:e2e`; use CI for macOS and Windows Rust builds if no local toolchain is available. Inspect browser results using only synthetic fixtures.
- [ ] Update `docs/codex-mcp.md` with tool inputs, limits, transaction semantics, conflicts, private-socket troubleshooting and the boundary that local transport does not prevent an AI client from processing requested content.
- [ ] Add one `docs/log/2026-10-17-mcp-snippets-images.md` note, independently review the scoped diff, create a public branch/PR and attach it to this chat. Add `major` and `mac-check`. Do not merge changes that touch the save path without the owner's explicit merge instruction.

## Acceptance

MCP clients can discover all new tools, make bounded batch snippet edits, import local images and organize their folders. UI reflects saved changes and reload preserves them. Invalid/stale snippet batches do not write. Image batches report individual outcomes without hiding partial success. New tools expose no accounts, original image data in list results, or arbitrary file contents. No production/private data is used for testing or committed.
