# D-031 保险箱 site icons

Lock, 2026-10-10: show real website icons, no live lookup; a few dozen of the most used sites are enough.

- **Bundled**: brand glyphs for about 30 common sites (Simple Icons 16.34.0, CC0) in `app/site-icons.ts`. No network. Amazon, OpenAI, UPS, Slack, LinkedIn and Microsoft are not in that set any more, so they keep the coloured initial.
- **Other sites**: when a 账号密码 entry has a web address, the app asks the site itself, once, for its icon (`desktop/site-icon.cjs`, Mac 保险箱 only): https only, public addresses only, no cookies, redirects only inside the same site, images only (no SVG), at most 100 KB. No icon service is contacted; the only thing that leaves the device is a request to the site the user entered anyway.
- **Kept**: the answer is stored encrypted on the device (`clipbox.site-icons.v1`, own label), never fetched again; a site with no icon is asked again after 30 days. Offline or no icon: the coloured initial stays. The cache is not part of backups (it is rebuilt by itself).
- Touches `desktop/` (one IPC call), so it merges only after Lock's 合并.
