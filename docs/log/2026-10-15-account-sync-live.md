# Account and sync API goes live (D1, VAULT_KEY, privacy page)

- Date: 2026-10-15 · Thread/agent: 官網 · 網站與 Cloudflare 操作（常駐）
- What changed: Owner said 可以 (D-063 accepted) and 部署. Created D1 copyboxx-users with schema.sql and bound it as DB. Set the Worker secret VAULT_KEY (generated in the session, never printed). R2 is switched off on the account, so api.mjs keeps blobs in a D1 table vault_blobs (capped at 1.9 MB) when no VAULTS bucket is bound. The privacy page gets a 登录与同步 section.
- User-visible change (plain Chinese, for the preview changelog): 无（官网隐私说明新增「登录与同步」；App 里的登录还没上）
- Not done / risks: RESEND_API_KEY not set yet, so codes cannot be mailed until the owner sets up Resend and its DNS. Losing VAULT_KEY makes cloud copies unreadable; apps would upload again from local data.
- Next step: owner sets up Resend; app thread turns on the sign-in entry.
