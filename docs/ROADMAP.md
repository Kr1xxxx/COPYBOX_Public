# Roadmap

What comes next, in the order to do it. Each item is a GitHub issue (acceptance criteria are in the issue). The task board
in `docs/HANDOFF.md` only holds what is being worked on right now; this file is the queue behind it.
Working rules: one item per PR; anything under `desktop/`, storage or encryption waits for the owner's 合并 (D-011).

Last updated: 2026-10-09 (web preview v1.01).

## Now / next

| Order | Item | Issue | Why now | Needs the owner first |
| --- | --- | --- | --- | --- |
| 1 | 图片备份 — encrypted local file for images | [#26](https://github.com/Kr1xxxx/Clipbox/issues/26) | Clearing app data currently loses every image | Approve the file format (new encrypted format) |
| 2 | 把图片当文件拖进 WhatsApp — native drag-out so WhatsApp gets the original file | [#27](https://github.com/Kr1xxxx/Clipbox/issues/27) | WhatsApp recompresses pictures sent as photos; price lists and payment QR codes get blurry | Touches `desktop/` → owner's 合并 |
| 3 | 图片缩略图 — small encrypted thumbnails | [#29](https://github.com/Kr1xxxx/Clipbox/issues/29) | The 图片 page decrypts every full image on each visit; slow with hundreds | Approve the storage change |
| 4 | 目录拖动排序 (images) | [#28](https://github.com/Kr1xxxx/Clipbox/issues/28) | Folders only keep creation order | — |

## Later

| Item | Issue | Notes |
| --- | --- | --- |
| 图片回收站 — undo and restore for deleted images | [#31](https://github.com/Kr1xxxx/Clipbox/issues/31) | Delete is permanent (with a confirm) today |
| 图片目录小打磨 — inline folder-name errors, "automatic colour" | [#32](https://github.com/Kr1xxxx/Clipbox/issues/32) | Parity with the 话术 sidebar |
| 图片无损压缩 — oxipng, optional | [#30](https://github.com/Kr1xxxx/Clipbox/issues/30) | Barely helps WhatsApp (it recompresses anyway); needs a new dependency, so only if space becomes a problem |

## Waiting on the owner

| Item | Issue |
| --- | --- |
| Windows 真机第一次试用清单 (a 10-minute checklist; real-device testing is waived, D-014) | [#33](https://github.com/Kr1xxxx/Clipbox/issues/33) |
| How the company's shared snippet library reaches every employee | [#34](https://github.com/Kr1xxxx/Clipbox/issues/34) |
| AI: which provider, who pays, may snippets contain customer data | [#35](https://github.com/Kr1xxxx/Clipbox/issues/35) |

## Done recently

Backup export for 备注/秘密 (now 秘密 on macOS only), the page.tsx split, CI type check, merge policy that ignores code
moves, 图片 section (D-017), 图片 folders (D-018) and the 图片 九宫格 view (D-019) (both PR #25, merged 2026-10-09), web preview with Windows/Mac switch.

## How this file is kept

When an item starts, move it to the task board in `docs/HANDOFF.md`; when it is merged, move it to "Done recently" and
close its issue. New ideas become an issue first, then a row here. Keep the "Now / next" list to at most five rows.
