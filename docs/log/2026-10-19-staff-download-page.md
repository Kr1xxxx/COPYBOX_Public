# Staff installers behind a password on copyboxx.com

- Date: 2026-10-19 · Thread/agent: 【官網】官網 · 網站與 Cloudflare 操作（常駐）
- What changed: New site page `/staff/` (员工下载) with a password field and Windows / Mac buttons; the Worker checks the
  password against the secret `STAFF_PASSWORD` on `POST /staff/download` (constant-time compare, 20 tries per IP and
  hour via the API's rate limits) and streams the newest staff build from `download/private-<token>/` only after a
  match. The exe/zip download name now follows the file name. D-080.
- User-visible change (plain Chinese, for the preview changelog): 无（只改官网）
- Not done / risks: The staff app's unlisted update address stays open (the app needs it); the password only guards
  the site's front door. Not deployed yet: the owner sets `STAFF_PASSWORD` in the Cloudflare dashboard and says 部署.
- Next step: Deploy from main after the owner's 部署; tell the packaging thread that `/staff/` always serves whatever it
  last uploaded under `download/private-<token>/`.
