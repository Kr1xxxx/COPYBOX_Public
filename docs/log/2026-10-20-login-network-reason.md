# Login page: say why the server could not be reached; system proxy; /api/activate

- Date: 2026-10-20 · Thread/agent: 【修复】内部版登录「连不上服务器」
- What changed: `cloud.rs` returns "network: …" with the whole cause chain (dns, connect, timeout, certificate) instead of a bare
  `network`, and the login page shows that reason in brackets after 「连不上服务器，请检查网络后再试」, so a screenshot
  of a real install says what failed. `POST /api/activate` is now on the shell's allow-list (the 激活码 step always
  said 「连不上服务器」 in a real install). reqwest gets the `system-proxy` feature: AI and TinyPNG requests go through the
  Mac / Windows system proxy like the browser does; 登录同步 and the update check try the system proxy first and then a
  direct connection (`cloud::clients`, owner 2026-10-20 「走直连还是系统的 都试一下」); site icons and the shared library
  keep opting out with `.no_proxy()`. The server itself was fine: `POST https://copyboxx.com/api/auth/code` answers `{"ok":true}`.
- User-visible change (plain Chinese, for the preview changelog): 登录时连不上服务器会在提示里写出原因；登录和检查更新先走电脑的系统代理、连不上再直连，两条路都试；填激活码不再误报「连不上服务器」
- Not done / risks: the real cause on Krix's Mac is not confirmed from here (never verified on a real Mac,
  `docs/features.json` cloud-sign-in-sync); the next screenshot will show it. `system-proxy` adds the
  `system-configuration` crate on macOS (feature of an existing dependency). Not run here: `cargo test` (no webkit
  on this machine; CI runs it, `mac-check` label added).
- Next step: Krix tries 2.0.36 on the Mac and sends the message if it still fails.
