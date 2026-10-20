# Website sign-in abuse limits (audit 2–5, 11, 13, 14)

- Date: 2026-10-20 · Thread/agent: 修復 · 網站登錄防刷
- What changed: tools/website only (D-094). Hourly limits and code tries are atomic; sign-in tries limited per IP;
  users are created on the right code, not on the request; admin code key can't be hit by the app; uncaught storage
  errors answer JSON; /staff/ cookie expires within 24 h. App code unchanged.
- User-visible change (plain Chinese, for the preview changelog): 无（网站登录更难被刷，App 和网页测试版没有变化）
- Not done / risks: needs a website deploy (「部署」 in the website thread). Residual risks listed in D-094.
- Next step: deploy after merge.
