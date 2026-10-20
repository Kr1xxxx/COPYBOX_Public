### D-087 人机验证 only for frequent code requests (2026-10-20)
- Context (owner, 2026-10-20: 「过人机验证 改成频繁才人机」). D-085 put Cloudflare Turnstile in front of every code
  request, so every login on a new computer had to pass it, and the Mac webview origin (`tauri://localhost`) was an
  open risk for every Mac login.
- Decision: the app sends `POST /api/auth/code` **without** a token first. The server (D-086, website Worker) counts
  requests per email and per IP as before; while `TURNSTILE_SECRET` is set, the **4th and later** request from the
  same email or the same IP within an hour must carry a valid Turnstile token, otherwise it answers 400 `captcha`.
  Only then does the login page show the widget (it stays for the rest of that login; a resend from the code step
  goes back to the email step with the widget and 「请先完成人机验证」). The hourly limits stay: 5 codes per email,
  20 requests per IP (a refused `captcha` request counts too).
- Why 3 free per hour: a normal login needs one code, a mistyped email or a lost mail two or three; a 4th request in
  an hour is somebody looping.
- Effect: a normal login never sees 人机验证, on Windows or Mac; bots and mail floods still hit the widget. Older apps
  without the widget work exactly as before (their first three requests an hour need no token either).
