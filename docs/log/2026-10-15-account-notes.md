# 账号 · 笔记 and 转为登录

- Date: 2026-10-15 · Thread/agent: 【功能】帳號筆記分類與轉為登錄
- What changed: New 笔记 category in 账号 on both platforms (Markdown, safe rendering, search by content, copy all), and 「转为登录」 from a note with a field-by-field preview, the original kept in the login (看原文) and 「还原为笔记」 (D-062). `app/note-core.ts`, `app/note-panel.tsx`, `app/note-markdown.tsx`; small hooks in `account-*.tsx`, `login-panel.tsx`, `page.tsx` (category icon only).
- User-visible change (plain Chinese, for the preview changelog): 账号新增「笔记」分类，可以用 Markdown 随手记；笔记可以「转为登录」，先预览每一项来自哪一行再保存，原文保留，可以「还原为笔记」。
- Not done / risks: 「转为 API」 waits for the API multi-secret fields PR; not tried on a real Windows PC or Mac.
- Next step: add 「转为 API」 on top of the API fields PR.
