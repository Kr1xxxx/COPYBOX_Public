### D-052 Company content reaches staff by 同步码, published by an agent (2026-10-14)
- Context (owner, 2026-10-14, thread 「內容下發 · 話術/圖片/帳號同步方案」): wants to push new 话术, images and accounts to
  the people using Copyboxx from the website, and to choose who receives them. Rejected a web admin page ("担心后台被攻破，
  被破解"): an agent publishes each time instead. Accounts are sent without passwords: only site, user name and note
  ("不带，只发网址、用户名和备注，密码让员工自己填").
- Decision: the company library of D-026 is hosted on copyboxx.com, one file per 同步码 at
  `https://copyboxx.com/sync/<code>/snippets.json` (Worker `copyboxx-site`, KV key `sync/<code>/snippets.json`). A code is
  given to one group of people; someone who never typed a code receives nothing. In Settings → 共享话术 the field takes the
  code (a full http(s) address still works). The app syncs on start and every 30 minutes while open, silent unless
  something changed and silent when offline or the code finds nothing. There is no admin page and no upload endpoint:
  the owner sends the exported file in the project and an agent uploads it only after the owner says 发布 / 部署 in that
  thread, keeping the previous file for rollback. Rules for agents: `docs/shared-library.md`.
- Consequences: no login and no per-person control: whoever has a code gets that group's file; to drop someone, give the
  group a new code. The stored setting is still `clipbox.shared-library-url` (now holds the code), so nothing migrates.
  Images and accounts follow in later steps with the same rules; account passwords are never sent.
- Status: accepted (owner, 2026-10-14).
