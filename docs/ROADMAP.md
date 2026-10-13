# Roadmap

What comes next, in the order to do it. Kept by the main agent; open GitHub issues are linked where they exist.
Working rules: one item per PR; who merges what is in AGENTS.md "Merging" (D-041).

Last updated: 2026-10-13.

## Now (owner said 照做 on 2026-10-13)

| Item | Notes |
| --- | --- |
| Save path: quitting with × saves first, restore cannot be overwritten, no key re-derivation per save, clear "storage full" message | Touches saving and keys → owner's 合并 |
| Automatic backup: images stored once and only new/changed ones written, no UI freeze, failure shown in 设置, pre-migration copy left out (D-043) | Backup file format → owner's 合并 |
| 账号: show a new recovery code if the first was never seen; delete the pre-migration copy after three unlocks (D-042) | Encryption path → owner's 合并 |
| Speed with 1,000+ 话术 (search cache, list rendering), one toast system (no clashing timers, error look, 清空回收站 failure) | — |

## Next

| Item | Issue | Notes |
| --- | --- | --- |
| Keep splitting `app/page.tsx` (~2,120 lines) in small PRs | — | Then fix the flaky image-folder drag e2e test |
| Tests: replace fixed waits in e2e and source-text assertions with behaviour checks, a little with every PR | — | Fewer random CI failures |
| Small hardening: site-icon fetch private-address checks, limits when reading backup files, Mac CLI not overwritten on every start | — | Not urgent |
| 把图片当文件拖进 WhatsApp — native drag-out so WhatsApp gets the original file | [#27](https://github.com/Kr1xxxx/Clipbox/issues/27) | Touches `src-tauri/` |
| 图片目录小打磨 — inline folder-name errors | [#32](https://github.com/Kr1xxxx/Clipbox/issues/32) | Check what is left |

## Later / waiting on the owner

| Item | Issue |
| --- | --- |
| Server: leaderboard upload + staff name (D-034), email reset, update check address | — (server built by another agent) |
| Move 话术 out of one localStorage entry if the company library grows past a few thousand entries | — |
| How the company's shared snippet library reaches every employee | [#34](https://github.com/Kr1xxxx/Clipbox/issues/34) |
| AI: which provider, who pays, may snippets contain customer data | [#35](https://github.com/Kr1xxxx/Clipbox/issues/35) |
| Windows 真机第一次试用清单 | [#33](https://github.com/Kr1xxxx/Clipbox/issues/33) |
| 图片无损压缩 (oxipng) — mostly covered by TinyPNG (D-037) | [#30](https://github.com/Kr1xxxx/Clipbox/issues/30) |

## Done recently

图片备份 inside 完整备份 and daily automatic backups (D-039, closes #26), 图片 thumbnails (D-024/D-025, #29), 图片 folder
drag sorting (#28), 图片回收站 (D-033, #31), 账号 section on both platforms with password lock and real encryption
(D-038/D-040), TinyPNG compression (D-037), Windows smoke test on CI, Tauri as the only desktop shell (Electron removed),
v1.63 reliability fixes, v1.64 话术 list (no jump on starring, header shadow, scroll bar, 收起 on the open card).

## How this file is kept

When an item is merged, move it to "Done recently" and close its issue. New ideas become a row here (and an issue if
it needs discussion). Keep "Now" to what is actually being worked on.
