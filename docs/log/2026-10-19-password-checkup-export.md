# 密码体检 and 账号表格 export

- Date: 2026-10-19 · Thread/agent: 帳號 · 密碼體檢與本地導出
- What changed: 账号 page header gets 「密码体检」 (logins whose password is reused, under 10 characters, or whose entry was last changed over a year ago; tap one to open it). 设置 → 数据 gets 「导出账号表格（.csv）」, a plain CSV of every 账号 entry outside the 回收站 (UTF-8 BOM for Excel) after a warning that the file is not encrypted. Both run on this device only; Windows account-password cloud sync (D-063) is untouched, per Krix 2026-10-19.
- User-visible change (plain Chinese, for the preview changelog): 账号页右上加「密码体检」；设置 → 数据 加「导出账号表格（.csv）」，导出前提醒文件没有加密
- Not done / risks: 「一年以上没改」 reads the entry's last change (any edit), not the password's own change date. CSV is export only, there is no CSV import back.
- Next step: 无
