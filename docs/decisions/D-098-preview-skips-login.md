### D-098 The web preview opens without the login page (2026-10-20)
- Context: since D-085 the app opens only after the email-code sign-in. In the web preview (claude.ai Artifact) that
  meant typing an email and the pretend code 123456 every time before anything could be looked at. Krix 2026-10-20:
  「网页测试版给我跳过验证码」.
- Decision: the preview's desktop shim (`tools/preview/build.mjs`) sets `window.clipboxDesktop.skipLogin = true`; the
  page then skips `LoginGate` and opens straight into the app. 登录同步 in 设置 still works against the pretend server.
- The desktop app is unchanged: `src-tauri/bridge.js` never sets `skipLogin` (guarded by `tests/tauri-shell.test.mjs`),
  so every installer still requires sign-in (D-085). The server is unchanged. Browser tests that set only `cloudDemo`
  still see the login page.
