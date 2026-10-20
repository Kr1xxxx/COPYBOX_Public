# 「稍后」 skips once, old running copy message, copyboxx- backup names

- Date: 2026-10-20 · Thread/agent: 修復 · 更新稍後、舊版衝突、備份檔名
- What changed: 「稍后」 on the update banner now hides it until the next launch or daily check instead of for good. On Windows, launching Copyboxx while an older copy (Clipboxx) is still running shows a message to quit the old one first instead of silently opening the old window. Backup and export files are now named copyboxx-…; old clipbox-… daily backups still list, restore and age out. D-102.
- User-visible change (plain Chinese, for the preview changelog): 更新提示点「稍后」只跳过这一次，下次打开还会提醒；Windows 上旧版 Clipboxx 还开着时，打开新版会提示先从托盘退出旧版；备份文件名改成 copyboxx-…，以前的备份照样能恢复。
- Not done / risks: The old-copy check was compiled for Windows (cargo check/clippy, x86_64-pc-windows-gnu) and its name logic unit-tested, but not run on a real Windows PC. It only names the old copy, it does not close it. Browser tests (tests/e2e) were updated but not run (light testing until the next big version).
- Next step: On Windows with an old Clipboxx in the tray, open Copyboxx and check the message appears; quit the old one and check Copyboxx opens.
