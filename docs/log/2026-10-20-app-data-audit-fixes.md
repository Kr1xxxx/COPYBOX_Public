# App data fixes from the audit (7, 15, 16, 18)

- Date: 2026-10-20 · Thread/agent: 修復 · 審計 7、15、16、18
- What changed: account encryption on/off runs inside the 账号/验证码 save queues so a cloud merge can't be overwritten;
  start-up asks to restore when an import was cut off and no data is left; a backup restore keeps the cloud sign-in;
  the 「最近」 count is capped at 50 like its list (D-096).
- User-visible change (plain Chinese, for the preview changelog): 恢复备份不再退出登录；导入中断后再打开会先问要不要恢复原来的内容；「最近」的数字和列表一致
- Not done / risks: item 7 was reasoned from the code and covered by a unit test, not reproduced with a real second computer.
- Next step: 无
