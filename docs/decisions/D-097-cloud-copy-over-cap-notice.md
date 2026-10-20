### D-097 A cloud copy over 1.9 MB tells the user to contact the manager and alerts the owner (2026-10-20)
- Context (owner, 2026-10-20). Asked to raise the cap; a 5 MB version that splits copies over D1 rows was built
  (patch kept in the project files, `plans/D-097-cloud-copy-5mb-split.patch`), then the owner said 「1.9mb 就可以了」
  and asked instead: 「如果超出 1.9mb 让联系管理者,并且后台给我提示,也给我发邮件」.
- Decision: the cap stays 1.9 MB. The app's message for a copy over it says 请联系管理者处理. The app (which refuses
  before sending) reports the size to `POST /api/vault/too-large`; the server does the same when it refuses an
  upload itself. Each report is kept in the D1 table `vault_oversize` (one row per user: size, time, last mail),
  shown in red on `/admin` with a line above the user list, and mailed to the `ADMIN_EMAILS` at most once a day per
  user. The next accepted upload of that user clears the row.
- Why: the owner hears about it the same day without staff having to explain; once a day keeps an account that
  syncs every few minutes from flooding the mailbox. Nothing about stored copies changes.
- Effect: needs `schema.sql` run on D1 at deploy (adds `vault_oversize`); until then reports answer ok and nothing
  is noted or mailed. Older apps show the old message and do not report, but their uploads over the cap are not
  sent either, so the owner only hears about updated apps.
