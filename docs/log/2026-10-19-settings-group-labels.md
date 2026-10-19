# Quieter group labels in Settings

- Date: 2026-10-19 · Thread/agent: UI · 設定頁分組小標題
- What changed: The group labels in Settings (外观, 账号与同步, 回收站, 图片压缩, 共享话术, 始终允许的程序, 连接 Codex 等工具, and the section names in search results) were 15px bold ink, bigger than the row titles under them, so they read as stray rows. They are now 12.5px, weight 500, gray (`--muted`), with less space above (the first one right under the 概览 wordmark sits close to it). One CSS rule in `app/globals.css`; layout and text unchanged. Preview VERSION 2.16 and changelog.
- User-visible change (plain Chinese, for the preview changelog): 设置里「外观」「账号与同步」这类分组小标题改成小一号的灰字，不再比下面的设置项还显眼，间距也收紧了
- Not done / risks: light testing (lint, typecheck, unit tests); checked in the browser for Mac and Windows, light and dark; not on a real desktop.
- Next step: Krix checks preview 2.16, then merge.
