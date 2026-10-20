# Direct retry only when the proxy route could not connect

- Date: 2026-10-20 · Thread/agent: 修復 · 直連重試只在連不上時
- What changed: `src-tauri/src/cloud.rs` retries directly only when the system-proxy route could not connect (new 10 s connect timeout); a request that already connected is never sent twice (D-089). Removed the matching `shortcut:` comment; new unit test checks refused vs. unanswered requests.
- User-visible change (plain Chinese, for the preview changelog): 网络慢时登录不会再收到两封验证码邮件；代理连不上时更快改走直连
- Not done / risks: not tried on a real Windows/Mac with a proxy.
- Next step: 无
