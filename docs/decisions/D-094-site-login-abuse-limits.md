### D-094 Website sign-in: limits that hold under bursts, codes nobody else can cancel (2026-10-20)
- Context: the 2026-10-20 whole-repo audit (items 2–5, 11, 13, 14; owner picked them 「2-6 改一下」, 「18 13 11 15 16」,
  「14 修一下」). D-087 (人机验证 only from the 4th code request an hour) stays as it is.
- Decision:
  - Every hourly counter (`allowRequest`) is bumped and read in one `INSERT … ON CONFLICT DO UPDATE … RETURNING`, and a
    sign-in code's try is counted in one `UPDATE … WHERE attempts < 5 RETURNING` before it is compared. A burst of
    parallel requests can no longer slip past "20 per IP", "5 per email", "5 tries per code", the activation and the
    /staff/ password limits. App and /admin share one code check (`consumeCode` in api.mjs).
  - `POST /api/auth/verify` allows 30 tries per IP an hour (`/admin/api/verify` 10), so one sender cannot keep
    killing a colleague's fresh code with wrong guesses.
  - Asking for a code no longer creates a user row; the right code does. A script mailing random addresses no longer
    fills the user table or pushes real staff out of /admin's newest-2000 list. This replaces D-086's "every email
    that asked for a code appears on /admin".
  - Admin codes are stored under `admin <email>` (with a space), which can never pass the app's email check, so the
    app's code request cannot overwrite and cancel the owner's admin code.
  - An uncaught D1/KV error in `/api` or `/admin` answers JSON `500 storage_error` instead of Cloudflare's error page.
  - The /staff/ cookie is the hash of the password and the current 12-hour slot, accepted in that slot and the next:
    a copied cookie works at most 24 hours instead of until the password changes.
- Not covered (owner's call): someone who knows a colleague's email can still use up that email's 5 codes an hour
  (passing 人机验证 from the 4th); a sender with many IP addresses can still kill codes; mail quota is only fully
  safe with 人机验证 on every request, which D-087 rejected. IPv6 address ranges (audit item 12) were not picked.
