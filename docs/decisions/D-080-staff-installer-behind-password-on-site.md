### D-080 The staff installers are on copyboxx.com behind the company password (2026-10-19)
- Context (owner, 2026-10-19: 「官网给我推送吧,但是输入密码后才能下载」). Until now the private (staff) builds were only reachable
  through their unlisted update address, never from the site (owner, 2026-10-15 「只给员工」); the public download page stays
  on the keyless public build (1.83.0, frozen) and is not touched by this decision.
- Decision:
  - A page `/staff/` (员工下载; not in the nav, `noindex`, not in the sitemap) with one password field and two buttons,
    Windows and Mac. It posts to `/staff/download`; the Worker compares the password with the secret `STAFF_PASSWORD`
    (both hashed, constant-time), counts at most 20 tries per IP and hour in the API's `rate_limits` table, and only
    then streams the newest staff build from `download/private-<token>/` (the files the packaging thread uploads).
    A wrong password goes back to the page's 「密码不对」 line, too many tries to 「试的次数太多了」.
  - The page's source carries no file address and no password; `GET /staff/download` is 405. The password lives only
    as a Worker secret the owner sets in the Cloudflare dashboard; never in the repo, the chat or memory.
  - Known limits, told to the owner: whoever has the password can pass it or the file on; the staff app's own update
    address stays unlisted and open (the app needs it), so someone who digs it out of the app can download without the
    password; a weak password can be guessed within the 20-per-hour limit from many addresses, so it should be long.
- Amended 2026-10-20 (owner: 「改成先点验证,验证通过才能下载这个版本」, 「验证做好动效」, 「员工版改成内部版」): the page is
  titled 内部版下载; the password is verified first (`POST /staff/verify`, a 「验证」 button with a spinner), a match sets a
  12-hour cookie and the Worker then serves `/staff/` with the download card (animated check mark, the build's version,
  Windows / Mac buttons to `/staff/file/win|mac`, which stream only with the cookie). `/staff/download` is gone.
- Tests: `tests/website-worker.test.mjs` (gate, wrong password, limit, no secret, missing file), `tests/website-build.test.mjs`.
