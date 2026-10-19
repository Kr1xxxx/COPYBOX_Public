# 密码体检 and 账号表格 export

- Date: 2026-10-19 · Thread/agent: 帳號 · 密碼體檢與本地導出
- What changed: 账号 page header gets 「密码体检」 (logins whose password is reused, under 10 characters, or whose entry was last changed over a year ago; tap one to open it). 设置 → 数据 gets 「导出账号表格（.csv）」, a plain CSV of every 账号 entry outside the 回收站 (UTF-8 BOM for Excel) after a warning that the file is not encrypted. Both run on this device only; Windows account-password cloud sync (D-063) is untouched, per Krix 2026-10-19.
- Round 2 (Krix 2026-10-19 15:59Z–16:00Z): 密码强度低 group (10+ characters but fewer than three of lower / upper / digit / symbol); a red dot on 密码体检 when it was never opened or not for two months and the check (run on the device) finds anything; LoginItem gets optional `passwordChangedAt` (set when the password changes; older entries fall back to updatedAt) and 「一年以上没改」 reads it; 「导入账号表格」 reads the exported .csv / .xlsx back as new entries, skipping rows already here. The table gained a 密码修改日期 column; 收款信息 / 地址 are written as 「名称: 内容」 lines so they come back field by field. Krix chose to keep the table unencrypted (no hashing, nothing on the server).
- User-visible change (plain Chinese, for the preview changelog): 账号页右上加「密码体检」（重复、强度低、少于 10 位、一年以上没改；两个月没看且有问题时按钮上有小红点）；设置 → 数据 加「导出账号表格」和「导入账号表格」
- Not done / risks: logins saved before this version have no password date, so their 「一年以上没改」 uses the entry's last change until the password is changed once. New localStorage key `clipbox.password-checkup-seen.v1` (only a timestamp).
- Next step: 无
