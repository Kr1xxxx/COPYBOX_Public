# Windows 账号页 and 账号页密码

- Date: 2026-10-12 · Thread/agent: 【安全】 Mac 版 2FA
- What changed: Windows now has the 账号 page (all categories except 其他, no old 目录 list) and both platforms can set a password
  (设置 → 数据 → 安全) that must be entered to open it (`app/account-lock.ts`, `app/account-lock-ui.tsx`, D-038). New storage key
  `clipbox.account-lock.v1` holds a salted hash only; existing stores are untouched. Windows tests that assumed no 账号 page were updated.
- User-visible change (plain Chinese, for the preview changelog): Windows 也有「账号」页了；设置 → 数据 → 安全里可以给账号页设一个打开密码，设置后每次进入账号页都要先输入。
- Not done / risks: no in-app "forgot password" reset (forgotten = cannot open the page). Mini window shows "账号页已上锁" while locked.
- Next step: Lock tries it in the web trial; decide on a reset option if wanted.
