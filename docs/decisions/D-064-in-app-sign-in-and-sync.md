### D-064 In-app sign-in with an email code, and how 话术 and 账号 sync between computers (2026-10-15)
- Context (owner, 2026-10-15): registration happens inside the app, not on a web page (「我说的是 app 内注册的可以不?」);
  no password, email code only (「不设置密码,只用邮箱验证码登录」); 「账号密码 windows 自动同步,mac 保存本地」. The server
  side, its endpoints and storage are D-063 (`tools/website/api.mjs`).
- Decision:
  - 设置 → 概览 → 账号与同步 gets 「登录同步」 above the 企业同步码: email → 6-digit code → signed in. Signed in it shows the
    email, 最后同步, 立即同步, 退出登录 (local data stays) and 注销账号 (asks first; deletes the cloud copy only).
  - What syncs: 话术 (with their 目录 and the company-library ids already received) and the 账号 entries of
    `clipbox.vault-items.v1`. Not yet: 图片, 验证码 (TOTP), the Mac's old 秘密 list, settings.
  - Windows uploads and receives 账号 passwords. A Mac never uploads its passwords, API values, recovery codes or the
    original note of a converted entry, and never stores the cloud's: it uploads the cloud's own values back untouched.
    Windows does not store API entries (no API category there, D-038) but leaves them in the cloud copy.
  - Three-way merge (`app/cloud-sync-core.ts`): each computer remembers a fingerprint of every entry from its last sync.
    Changed on one side → that side wins; on both → the later edit wins, ties keep this computer's; deleted on one side
    and untouched on the other → deleted. A first sync keeps everything from both sides. 话术 numbers and copy counts stay
    per computer. A sync that would delete more than half of what is here (and over 20 entries) is refused.
  - A locked 账号 page (D-040) syncs only 话术 until it is unlocked.
  - When: on start, 8 seconds after a change, every 10 minutes, and 立即同步. Upload conflicts (another computer synced in
    between) download, merge and try again.
  - The sign-in token: Windows Credential Manager (name `cloud-session`, like D-057); macOS the page's storage, like the
    other secret settings, because an unsigned Mac app can lose Keychain items after an update (D-012). The token, email
    and last-sync fingerprints (`clipbox.cloud-session.v1`, `clipbox.cloud-account.v1`, `clipbox.cloud-sync-base.v1`) are
    never in a 完整备份; restoring one signs this computer out, so a restore can never be mistaken for deletions.
  - Requests go through the desktop shell (`cloud_request`, `src-tauri/src/cloud.rs`): only https://copyboxx.com and only
    the six /api/ paths, no redirects, size limits both ways.
  - Until the server is live (`CLOUD_SERVER_LIVE` in `app/cloud-client.ts`), real installs show no 登录同步. The web preview
    uses a pretend server in the page (`app/cloud-demo.ts`, code 123456).
- Consequences: whoever can read the person's email can sign in and read their synced content (the server encrypts at
  rest with its own key, D-063), so staff email should have two-step login. Turning it on for staff is one line
  (`CLOUD_SERVER_LIVE = true`) plus a new installer, after the owner's 「部署」 of D-063.
- Status: accepted (owner's messages, 2026-10-15).
