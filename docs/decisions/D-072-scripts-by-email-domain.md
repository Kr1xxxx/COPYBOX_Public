### D-072 Company 话术 by the signed-in email's domain (2026-10-15)
- Context (owner, 2026-10-15: 「共有仓库版本,能不能根据登录邮箱域名来下发话术?」, then picked 「只要域名」): staff who sign in
  with 登录同步 (D-063 / D-064) using the company's own email domain should get the company 话术 without typing a 同步码,
  in the public build too. No editable admin page (D-052, D-065).
- Decision:
  - The server keeps a short table «domain → 同步码» in the site's KV (`domains/<domain>`, value = the code). A signed-in
    app asks `GET /api/library` and gets that code's library (the same file as `/sync/<code>/snippets.json`), or
    `{ domain: null, library: null }`. Only a whole, exactly matching domain counts (`sales.company.com` is not
    `company.com`); there is no binding for a single address.
  - Free-mail domains (gmail, QQ, 163, 126, outlook, hotmail, icloud, yahoo, …; `tools/website/free-mail.mjs`) can never be
    bound, and the server never serves one even if a key exists. The sign-in is a code sent to that mailbox, so only
    someone who can read mail at the domain gets its 话术.
  - Binding is done by an agent with `node tools/website/sync.mjs --link-domain <domain> --code <CODE>` (also
    `--unlink-domain`, `--list-domains`), only after the owner says 发布 in the thread, like publishing a library.
  - In the app, a typed 同步码 always wins. Without one, a signed-in app fetches the domain library on start, after
    signing in and every 30 minutes, and applies it exactly like a 同步码 library (D-026 rules, 更新通知 of D-071). While a
    domain library is active (`clipbox.domain-library.v1`, this computer only, never in a 完整备份) the built-in 话术
    of a company build (D-066) are not applied, so the two cannot fight; publish the same file for that code.
  - 设置 → 账号与同步 shows 「公司话术：按邮箱自动获取（domain）」 while it is active.
- Consequences: the 话术 never enter the public repo; someone signed in with another domain gets nothing. Removing a
  binding stops updates on the next sync but entries already received stay on each computer (as with a 同步码). A
  person who leaves keeps receiving until their sign-in ends (90 days, or when the company closes the mailbox and the
  session is removed). Signing in also syncs the person's own 话术 and 账号 (D-064). Staff with only gmail/QQ addresses
  still need a 同步码.
- Status: Accepted (owner, 2026-10-15).
