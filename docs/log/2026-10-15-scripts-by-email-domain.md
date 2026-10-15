# 话术 by the signed-in email's domain

- Date: 2026-10-15 · Thread/agent: 研究 · 按邮箱域名下发话术
- What changed: The site can bind a company email domain to a 同步码 (`sync.mjs --link-domain`); a signed-in app asks the new `GET /api/library` and applies that library like a 同步码 one, unless a 同步码 is typed (D-072). Free-mail domains are refused.
- User-visible change (plain Chinese, for the preview changelog): 用公司邮箱登录同步后，公司话术会自动下发，不用再填同步码；设置里会显示「公司话术：按邮箱自动获取」。
- Not done / risks: Live only after the owner's 「部署」 of the website and a new installer; the owner still has to name the company domain and say 发布 to bind it. Staff using gmail/QQ addresses still need a 同步码.
- Next step: Website thread deploys on 「部署」, binds the domain on 「发布」; packaging thread builds the next installers.
