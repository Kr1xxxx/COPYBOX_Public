# Mini window fills highlighted blocks; staff settings trimmed

- Date: 2026-10-14 · Thread/agent: 顧問 · 網站與 App 可改進之處 (advice items 11 and 13)
- What changed: The mini window's 复制 (and Enter) no longer copies `[Name]` with brackets: each unfilled highlighted block takes its first value (pinned, then newest), else its default (Name → Friend), else its own word, and a toast says what was used (`quickFillValues` in `app/variable-memory.ts`, `copyMini` in `app/page.tsx`). 导入测试内容 / 清除测试内容 in 设置 → 数据 show only in the browser and the web preview (`testTools` on the preview's desktop shim), never in the installed app. The editor's AI 润色 button shows only when an AI is set up in 设置 → AI (or the browser has a built-in model); AI 整理 stays.
- User-visible change (plain Chinese, for the preview changelog): 迷你小窗复制带高亮块的话术时，没填的高亮块自动用第一个值（Name 默认 Friend），不会再把「[Name]」原样复制出去，并提示用了什么；安装版的设置里不再显示「导入测试内容 / 清除测试内容」；没设置 AI 时编辑器不再显示「AI 润色」按钮
- Not done / risks: The 图片压缩 key field is not folded yet: PR #158 (two TinyPNG keys) is rewriting that card, so it is left to that PR to avoid a conflict. The AI tab itself stays (someone has to be able to set it up).
- Next step: 无
