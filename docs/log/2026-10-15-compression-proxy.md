# Image compression through copyboxx.com (D-055)

- Date: 2026-10-15 · Thread/agent: 「做代理」 TinyPNG proxy
- What changed: the Worker answers POST /compress for a valid 企业同步码 and forwards the picture to TinyPNG with the
  Worker secret TINIFY_KEYS (5 MB cap, PNG/JPEG/WebP only, 20 a minute per code, same 404 as /sync/). The desktop shell
  sends "proxy:<code>" requests there; the app uses it when no own key is set but a 企业同步码 is. Also audit item D:
  company library capped at 5 MB / 5000 entries / 20000 characters a field, and 账号 links only open http(s).
- User-visible change (plain Chinese, for the preview changelog): 填了企业同步码就能自动压缩图片，不用再自己申请密钥；设置 → 图片压缩 会显示「已通过企业同步码压缩」
- Not done / risks: needs the Worker deployed and the secret TINIFY_KEYS set by the owner; until then compression through
  the code fails and the original is kept. Not tried in the real Windows/Mac app against the live Worker.
- Next step: website thread deploys the Worker after merge; a new installer is needed for the app side.
