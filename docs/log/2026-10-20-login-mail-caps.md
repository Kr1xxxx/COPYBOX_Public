# Website sign-in: per email+IP quota and daily mail cap

- Date: 2026-10-20 · Thread/agent: 修復 · 網站登錄防刷
- What changed: tools/website only (D-100). Codes per email: 5 per IP, 20 in all an hour. Non-activated emails share
  50 mails a day. Cloudflare edge rate-limit rule added on the zone (outside the repo).
- User-visible change (plain Chinese, for the preview changelog): 别人替你的邮箱要验证码，不会再让你自己要不到码（网站部署后生效，网页上看不到）
- Not done / risks: needs a website deploy. Residual risks in D-100.
- Next step: deploy after merge.
