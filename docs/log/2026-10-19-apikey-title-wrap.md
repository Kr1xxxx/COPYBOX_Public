# API 密钥 form: 保密内容 title no longer wraps per character

- Date: 2026-10-19 · Thread/agent: 修復 · 保密內容標題擠成一列
- What changed: The 保密内容 heading in the API 密钥 edit form was a fieldset legend inside a grid fieldset; the Mac app's WebKit squeezed it to one or two characters per line. It is now a plain title linked to the fieldset with `aria-labelledby`, plus an e2e check that it stays on one line.
- User-visible change (plain Chinese, for the preview changelog): Mac 账号 → API 密钥 编辑时，「保密内容」和提示文字不再一字一行。
- Not done / risks: The browser tests run Chromium, which never showed the bug; the WebKit fix is confirmed only on the next Mac build.
- Next step: 无
