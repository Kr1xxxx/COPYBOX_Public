### D-089 No public download on the site; download buttons become an inquiry form (2026-10-20)
- Context (owner, 2026-10-20: 「官网公开版全部删除,下载按钮改成邮件联系的询单,需要人机验证后才能发」). The public
  installer 1.83.0 had been frozen on copyboxx.com/download/ since the morning (no updates); the owner now wants no
  public version at all and to talk to interested people first.
- Decision: the site hosts no public installer and no public `download/latest.json`. The download page becomes
  `/contact/`, an inquiry form (name, email, company, message) behind Cloudflare Turnstile (the login widget's site
  key, D-086); the Worker checks the token server side before anything is sent, then mails the inquiry through
  Resend to the addresses in `ADMIN_EMAILS` with the visitor's address as reply-to. Every download button and link
  on the site leads to the form; `/download/` redirects there. The 内部版 behind `/staff/` and its private update
  path are untouched.
- Effect: already installed public 1.83.0 copies get a 404 on their update check and stay on 1.83.0 for good; the
  only download on the site is the password-gated 内部版. copyboxx.com still has no mailbox: inquiries land in the
  owner's own mailbox (the `/admin` address), and a reply from there goes straight to the visitor.
