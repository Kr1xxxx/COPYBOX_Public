# 更新通知 (D-071)

Staff see one small card after an update reaches them. The owner approves every text before it ships.

## What goes in

- Only notable additions: a new feature (e.g. 话术可以分享给同事), new content (新增 12 条话术、5 条 Tips).
- Never button moves, design or colour changes, small fixes, or anything already shipped before.
- Short plain Chinese, one fact per line, at most 6 lines of up to 80 characters. No version numbers or technical words.
- Nothing notable → no notice at all.

## Workflow (every push)

1. The thread that releases the change (packaging for app builds, the 话术 thread for 同步码 pushes) drafts the lines
   and posts them to the owner **before** the push.
2. The owner approves or edits them. Without his OK nothing ships with a notice.
3. App build: add `{ version: "1.<preview>.0", items: [...] }` at the top of `RELEASE_NOTES` in `app/release-notes.ts`
   (the version of the build that carries it) and use the same lines as `notes` in the update manifest.
   Private-only lines (e.g. built-in 话术 counts) go in the private repo only.
4. 同步码 push: put the lines in a text file (one per line) and publish with
   `npm run sync:publish -- --code <CODE> --snippets <file.json> --notice <notice.txt>` after the owner's 发布.
   A push without `--notice` carries no notice.

## How it shows

- After an app update: once, title 「Copyboxx 已更新」, all lines since the last version this computer saw.
  A new install shows nothing.
- After a 同步码 sync that brings a new notice: once, title from the file (default 「公司话术有更新」) and
  「不用更新软件，已经自动同步好了」. A computer getting that library for the first time shows nothing.
- It waits for the first-run guide and for the full window. 知道了 or Esc closes it.
- Web preview: the 看更新通知 menu shows both kinds with sample text (nothing is stored).
