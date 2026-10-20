### D-100 Website sign-in: per email+IP quota, daily mail cap, Cloudflare edge limit (2026-10-20)
- Context: residual risks of D-094. Owner 2026-10-20 「可以 做」 on options 1–3 (someone asking for a colleague's
  codes locks them out; random addresses use up the Resend quota; floods should stop before the Worker).
- Decision:
  - Code requests per email an hour: 5 from one IP (`email-ip:<email>:<ip>`) and 20 in all (`email:<email>`), so
    asking for someone else's email from another IP no longer locks its owner out. 人机验证 still starts at the 4th
    request per email or IP (D-087, unchanged).
  - Emails that are not activated (D-086) share 50 mails a day (`mails:not-activated`, daily window). Staff on a
    company domain and customers who redeemed a code are never held back by it. Resend's free plan sends 100 a day.
  - `allowRequest` takes a window (default one hour); `sweep()` keeps counters for a day.
  - Cloudflare rate-limiting rule on zone copyboxx.com (free plan, set through the API, not in this repo): POSTs to
    `/api/auth/code`, `/api/auth/verify`, `/api/activate`, `/admin/api/code`, `/admin/api/verify`, `/staff/verify`,
    `/contact/send` — more than 10 in 10 s from one IP are blocked for 10 s at the edge.
- Not covered: device blacklisting (a script can send any device id); an attacker with many IP addresses (IPv6 ranges,
  audit item 12) still gets more tries; when the daily cap is used up, new non-activated customers wait until the
  next day.
