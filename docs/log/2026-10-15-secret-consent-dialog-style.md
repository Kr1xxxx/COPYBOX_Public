# 允许读取秘密吗？ dialog restyled as the small confirm card

- Date: 2026-10-15 · Thread/agent: 弹窗 · 允许读取秘密 UI 风格
- What changed: `AutomationConsentDialog` (app/dialogs.tsx) borrowed the large 备份 dialog (470px, orange 「命令行」 label above a 25px title, 48px buttons). It now uses the same small card as 删除确认 (`delete-confirm-*`, 390px, title first with the question under it, 40px buttons) per the UI rules in docs/agent-notes.md (no filler labels over titles, same look for the same kind of question). The 「如果不是你自己刚刚运行的命令」 hint sits in the soft warning strip used elsewhere (`.consent-note`). The button row is flex, so a third button (始终允许, parallel thread) fits on one row. Also fixed dark mode for every 删除确认 card: the header stayed white and the button row had a grey strip.
- User-visible change (plain Chinese, for the preview changelog): 「允许读取秘密吗？」弹窗改成和删除确认一样的小卡片：去掉标题上方的「命令行」小字，提醒放进浅色提示条；深色模式下删除确认弹窗的标题区不再是白底。
- Not done / risks: Not tried on a real Mac (the dialog only appears there, from the `clipbox` command line); checked in the browser with the e2e fake, light and dark.
- Next step: 无
