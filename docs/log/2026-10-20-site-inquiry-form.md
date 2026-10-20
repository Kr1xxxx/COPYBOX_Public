# Website: public download removed, download buttons become an inquiry form

- Date: 2026-10-20 · Thread/agent: 【官网】刪公開版、下載改詢單
- What changed: tools/website no longer builds or serves the public installer and latest.json (D-092); /download/ became /contact/, a Turnstile-gated inquiry form whose POST /contact/send mails the owner through Resend (reply-to the visitor, 5 per IP an hour); every download button and link on the site leads there; the site pages no longer show a version line.
- User-visible change (plain Chinese, for the preview changelog): 官网不再提供公开下载，下载按钮改成「联系我们」询单，通过人机验证后才能发送
- Not done / risks: deploying also deletes download/Copyboxx-Setup.exe and download/latest.json from KV, so installed public 1.83.0 copies stop finding updates. Inquiries are only mailed, not stored; if Resend is down the visitor sees 「发送失败」 and nothing is kept.
- Next step: website thread deploys from main after the owner's 「部署」 (website:build + website:deploy; the deploy's stale-key step removes the two public files).
