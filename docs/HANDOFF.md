# Handoff board

> The single "where are we now". Feature PRs do **not** edit this file (parallel PRs would conflict): leave a note in
> `docs/log/` instead. Only the coordinator updates the status below. Keep this file under 100 lines.

## Status (2026-10-09)

- Repository: https://github.com/Kr1xxxx/Clipbox
- `main` has the new UI ("H") since PR #1 was merged on the owner's word. Start from `main`.
- Checks on `main`: lint passes, `npm run typecheck`, `npm test`, `npm run test:e2e` (browser end-to-end) all green.
- Decisions: `docs/DECISIONS.md`. Verification status: `docs/features.json` — verified in a browser only. The owner
  waived real-device testing (D-014), so Windows/Mac stay `false` there until someone actually walks through the steps.

Merging (D-011): small PRs merge themselves when CI is green; big ones are labelled `needs-owner` and wait for the
owner to write 合并.

Web preview for the owner: the current version is in `tools/preview/VERSION` (owned by the preview publisher).
Windows / Mac switch, ten simulated test images. It is built from the branch under review, not from `main`.

Workflow (`CLAUDE.md`): the main Claude session coordinates; Sonnet workers (`.claude/agents/worker.md`) do pieces in
git worktrees under `.claude/worktrees/`; the coordinator reviews, merges and pushes.

## Task board (frozen)

Frozen on 2026-10-09: rows 1–15 are history. New work is tracked by PRs and the notes in `docs/log/`, not by new rows.

States: Todo / In progress / Done / Blocked / Cancelled. Only one task "In progress" at a time.

| # | Task | State | Owner | Notes |
| --- | --- | --- | --- | --- |
| 1 | Windows: build the installer, walk through tray, launch at login, AI key per `docs/features.json` | Cancelled | Owner | Owner waived real-device testing (D-014) |
| 2 | Mac (Apple silicon): build and open, check title bar and 秘密 | Cancelled | Owner | Owner waived real-device testing (D-014) |
| 3 | Merge PR #1 | Done | Claude | Merged 2026-10-08 on the owner's 确认 |
| 4 | Protect the vault's device key with OS encryption | Cancelled | Owner | Built in PR #7, then removed on the owner's decision (D-015). Can be restored from git history |
| 5 | Backup/export for the 备注/秘密 section | Done | Claude | Settings → 导出备注备份 (秘密 on Mac): own encrypted local file, separate from snippets (D-016); imported with 导入备份. PR #15, merged on the owner's approval (replaced an old macOS test that forbade the button) |
| 6 | Split `app/page.tsx` into component files | Done | Claude | page.tsx ~1560 lines; parts: `ai-client.ts`, `ai-settings.tsx`, `dialogs.tsx`, `fill-panel.tsx`, `settings-folders.tsx`, `settings.tsx`, `item-editor.tsx`, `platform.ts`, `preferences.ts`, `desktop-bridge.ts` (the `window.clipboxDesktop` type). Source-text tests read all UI files through `tests/helpers/ui-source.mjs` |
| 7 | Alternative to the tray: Windows setting "缩到任务栏" keeps the taskbar button; Dock click already reopens on Mac | Done | Claude | No shortcuts (D-005) |
| 8 | CI type check of `app/` | Done | Claude | `npm run typecheck` (`tsconfig.typecheck.json`, separate from the build); owner approved |
| 9 | Merge policy: code moved unchanged is not a storage change | Done | Claude | `scripts/classify-pr.mjs`; edited, new or deleted storage lines still need the owner; owner approved |
| 10 | 导入备份 → 合并 restores an entry whose identical copy is in the trash | Done | Claude | Was silently skipped as a duplicate; found while building task 5 |
| 11 | Auto-merge only the commit CI checked | Done | Claude | A push after green CI was merged before its own checks finished (#22); owner approved the fix |
| 12 | 图片 section (D-017): Windows 话术 \| 图片, Mac 话术 \| 秘密 \| 图片; copy images | Done | Claude | Spec `docs/specs/image-section.md`; store by an Opus worker, desktop IPC and UI by Sonnet workers; PR waits for the owner's 合并. Not in v1: folders, trash, image backup |
| 13 | 图片 folders (D-018) | Done | Claude | Store by an Opus worker (`image-store.ts`), UI by a Sonnet worker (`image-library.ts`, `image-folders.tsx`, `image-folders-core.ts`); Merged as PR #25 (2026-10-09). Not yet: drag-sorting folders, image backup |
| 14 | Web preview tool in the repo (`tools/preview/`, `npm run preview:build` / `preview:serve`) | Done | Claude | Was only in a temp folder; now any session can rebuild the preview with its version number. PR waits for the owner (package.json, eslint config) |
| 16 | 图片 16宫格 + full-picture thumbnails (D-020) | Done | Claude | 4 per row, `object-fit: contain`; PR waits for review by CI/owner |
| 17 | Motion from arc-library, step 1 of 4 (D-021): copy icon + toast | In progress | Claude | Adds `motion` (needs the owner's 合并). Steps 2-4: switches/segmented/checkboxes; menus/dialogs; rename/search/drop zone/empty pages/counters |
| 19 | 图片 tile glass: real frosted look (blur kept in build, grain, highlight) | In progress | Claude | Acceptance finding after #38 |
| 18 | 图片 detail scrolls so the clicked picture stays fully visible (advisor item 12) | In progress | Claude | `detailScrollDelta` in `image-view-core.ts`; PR stacked on #38 |
| 20 | Settings: 自动清理 defaults to 7 天; 目录 groups fold open on click (arc-library accordion motion, `app/arc/collapsible.tsx`); new 图片目录 group (create, rename, colour, delete; no ordering: the image store has none) | Done | Claude | Stacked on PR #39 (uses `motion`); merges after #39. The 7-day default applies to everyone who never picked an option |
| 26 | 图片 thumbnails stored unencrypted (owner 2026-10-10; D-024 updated) | In progress | Claude | Plain bytes in `clipbox-image-thumbs`; old encrypted rows are ignored and replaced; originals untouched. Thumbnails are now readable on disk without the key |
| 22 | 图片 thumbnails (D-024, advisor item 9): small encrypted copies in their own database | In progress | Claude | Originals untouched; `getThumb` in `image-store.ts` |
| 24 | 图片 tile copy button only on hover or keyboard focus (always on touch) | In progress | Claude | Acceptance: it covered the picture corner |
| 23 | Dropdowns (全部产品, row menu, bulk 移动到, folder menu) close on outside click and Esc | In progress | Claude | Lock reported the 全部产品 filter stayed open |
| 21 | Motion from arc-library, step 2 of 4 (D-021): segmented controls glide one highlight pill | In progress | Claude | `app/arc/segmented.tsx`; used by the section switch, search scope, 宫格\|列表, settings choices, secret display switch |
| 25 | 话术搜索: pinyin + initials, rank by hit place and copy count | Done | Claude | `app/snippet-search.ts`; new dependency `pinyin-pro`; `useCount` on items (optional, no migration) |
| 15 | 图片 九宫格 (D-019) | Done | Claude | Merged with PR #25 (2026-10-09). Sonnet worker; list view kept behind a switch; existing list tests start in list view via `asDesktop(..., { imageView: "list" })` |

The queue behind this board is `docs/ROADMAP.md` (each item is a GitHub issue).

## Waiting on the owner

- How the company's shared snippet library reaches every employee (today each person imports a spreadsheet).
- AI: which provider, who pays for the key, whether snippets may contain customer data.

## Known risks

- Images (D-017) are not in any backup file yet; clearing app data loses them. Copying an image on a real Windows machine is untested (D-014).
- The product is mainly for Windows but has never run on a real Windows machine (testing waived, D-014); the first real use is the real test, so keep the encrypted snippet backup. The vault and its key are stored together (D-015).
- Many unit tests assert on source text and break on refactors; `tests/e2e/` is the reference for behaviour.
