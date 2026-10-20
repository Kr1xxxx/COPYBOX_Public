# 内部版下载页：先验证再下载

- Date: 2026-10-20 · Thread/agent: 【官網】官網 · 網站與 Cloudflare 操作（常駐）
- What changed: `/staff/` is now 内部版下载 (owner: 员工版 → 内部版). The password is verified first: `POST /staff/verify`
  sets a 12-hour `staff` cookie (hash of the password) and the Worker serves `/staff/` marked verified, which swaps the
  form for an animated download card (check mark, staff build version, Windows / Mac buttons); `GET /staff/file/win|mac`
  stream the newest staff build only with the cookie. `/staff/download` is gone. D-080 amended.
- User-visible change (plain Chinese, for the preview changelog): 无（网站）
- Not done / risks: no Turnstile on this page (the owner said 验证 = 密码验证). The shake on a wrong password uses
  `:has()`, so very old browsers just show the red line. Someone with a valid cookie can download for 12 hours; changing
  the password invalidates every cookie.
- Next step: deploy from main (with PR #249 if merged).
