# 登录同步: match the live server's limits and errors

- Date: 2026-10-15 · Thread/agent: 【功能】App 內郵箱登錄與同步
- What changed: The client now matches the live account server (PR #191). The cloud copy limit drops from 5 MB to 1.9 MB because vaults live in D1 without R2, and anything bigger is refused before upload. `413 too_large` and `503 unavailable` (no RESEND_API_KEY yet) get their own plain Chinese messages. The pretend server now answers like the live one (401 bad_code / unauthorized, 413 over 1.9 MB). Checked by hand against https://copyboxx.com/api: 401 unauthorized, 503 unavailable, 401 bad_code and 405 all match.
- User-visible change (plain Chinese, for the preview changelog): 登录同步：内容太多超过云端上限、或服务暂时不能用时，会给出清楚的提示
- Not done / risks: Sign-in is still hidden in real installers (CLOUD_SERVER_LIVE = false) until a real code email has been confirmed.
- Next step: Turn on CLOUD_SERVER_LIVE once the website thread confirms that Resend delivers codes.
