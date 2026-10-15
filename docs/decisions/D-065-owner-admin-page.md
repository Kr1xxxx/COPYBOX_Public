### D-065 A read-only owner page at copyboxx.com/admin (2026-10-15)
- Context (owner, 2026-10-15): 「可以给我做个后台,我用来看用户和邮箱等设置,登录时间等内容的?」. Earlier (D-052 era) he
  wanted no web admin backend for fear of attacks; asked again with that on a decision card, he chose 「只读网页后台」.
- Decision:
  - `/admin/` shows each registered email, when it registered, last signed in and last synced, the signed-in computers
    (device names) and the size of the cloud copy. Nothing on it changes user data, and it never decrypts content.
  - Only addresses in the Worker secret `ADMIN_EMAILS` can sign in, with a 6-digit email code (Resend, as D-063). Other
    addresses get the same answer and no mail. 12-hour HttpOnly SameSite=Strict cookie; strict CSP; noindex.
- Consequences: someone who takes over the owner's mailbox can read the user list (emails and times), not staff
  content. Deleting users or signing out computers is not offered; it would need a new decision.
