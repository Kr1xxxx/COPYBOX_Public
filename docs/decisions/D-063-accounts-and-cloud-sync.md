### D-063 Optional email-code login and sync across computers through copyboxx.com (2026-10-15)
- Context (owner, 2026-10-15): staff want their 话术 and 账号 on a second computer. The owner chose in-app
  registration with sync across computers, then 「不设置密码，只用邮箱验证码登录」, and that 账号-page passwords sync on
  Windows and stay local on macOS. Plan: `/mnt/project-files/plans/account-sync-plan.md` (its 同步密码 parts are cancelled).
- Decision:
  - Registering is optional. Without an account the app stays fully local, exactly as today.
  - For people who register, this overturns "data only on the device, no server, no accounts": the copyboxx.com
    Worker keeps one blob per user (`/api/*`, `tools/website/api.mjs`, D1 `copyboxx-users` + R2 `copyboxx-vaults`).
  - No password at all. Login is a 6-digit code sent to the email (10 minutes, 5 tries, 5 codes per email and 20
    requests per IP each hour); a session lasts 90 days. Only SHA-256 values of codes and session tokens are stored.
  - The server encrypts each blob at rest with AES-GCM under a key derived (HKDF) from the Worker secret `VAULT_KEY`
    and the user id, so a copy of D1 or R2 alone is unreadable. It is not end-to-end: whoever can read the mailbox
    can sign in and get the synced content, and whoever controls the Worker can decrypt it.
  - 账号-page passwords sync automatically on Windows. On macOS they stay local: the Mac neither uploads nor downloads
    them, but still syncs 话术 and the other 账号 fields. The server is the same either way (one blob per user).
  - 图片 are not synced in the first version.
- Consequences: the privacy page, the in-app wording and `AGENTS.md` ("no server, no accounts") need updating when
  the app side ships. The app side touches saving and encryption, so it is a high-risk PR that waits for 合并.
  Nothing is live until the owner says 部署 and the D1/R2 resources and secrets exist (`tools/website/README.md`).
- Status: proposed, waiting for the owner (server side written, not deployed).
