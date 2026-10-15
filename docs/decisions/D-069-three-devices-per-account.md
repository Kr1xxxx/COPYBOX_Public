### D-069 One account is signed in on at most 3 computers (2026-10-15)
- Context (owner, 2026-10-15: 「现在是不是允许同账号多终端登录? 设置最多三个」): until now 登录同步 (D-063, D-064) let one
  email stay signed in on any number of computers for 90 days each.
- Decision:
  - The server keeps at most 3 live sessions per account. Signing in on a 4th computer always succeeds and signs out the
    oldest one (by sign-in time), so a person who replaced a computer is never locked out. `POST /api/auth/verify`
    answers `signedOut` with the device names it ended; the app says 「已超过 3 台，最早登录的「…」已自动退出登录」.
  - The ended token is remembered in D1 `ended_sessions` (token hash and its old expiry, nothing else) so that computer
    hears `401 device_limit` and shows 「这个账号在别的电脑上登录了…」 instead of a bare 请重新登录. Until the table exists
    on the live database the limit still holds; the old computer just hears 请重新登录.
  - 退出登录 frees a place at once. The /admin page lists at most 3 devices per user.
- Consequences: no change to stored data, keys or the vault; one new table (`CREATE TABLE IF NOT EXISTS`, run schema.sql
  again before deploying). The preview's pretend server follows the same rule.
- Status: Accepted.
