# Cloud copy over 1.9 MB: contact the manager, alert the owner (D-097)

- Date: 2026-10-20 · Thread/agent: 功能 · 雲端副本超限提示
- What changed: The too-large sync message now says 请联系管理者处理. The app reports the refused size to the new `POST /api/vault/too-large`; the server notes it (and its own 413s) in D1 `vault_oversize`, shows it in red on /admin and mails ADMIN_EMAILS at most once a day per user; an accepted upload clears it. Cap stays 1.9 MB.
- User-visible change (plain Chinese, for the preview changelog): 云端副本超过 1.9 MB 时提示「请联系管理者处理」，并通知管理者
- Not done / risks: Website deploy must also run schema.sql on D1 (new table vault_oversize); until then nothing is noted or mailed. Older apps do not report.
- Next step: After deploy, sign in with a test account and check the /admin line and the mail once.
