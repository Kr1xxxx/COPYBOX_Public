# Settings home: version, update date, 账号 and 同步

- Date: 2026-10-14 · Thread/agent: 设置首页 · 版本号、账号、同步
- What changed: The first Settings page shows the version and the update date (Taipei calendar, `formatTaipeiDate` in `app/clipbox-core.ts`) to the right of the wordmark, from the same `getVersion`/`getBuildTime` the 关于 page uses (desktop: app version and build time; web preview: `tools/preview/VERSION` and the newest changelog "at"). A new 「账号与同步」 card links to the 账号 page and its 安全 settings, and shows the last company-library sync (`clipbox.shared-library-last`) with a 去同步 link to 数据 → 共享话术. In `app/page.tsx` only the `onOpenAccount` prop of `SettingsDialog` was added.
- User-visible change (plain Chinese, for the preview changelog): 设置首页顶部直接显示版本号和更新日期；新增「账号与同步」：一键打开账号页或安全设置，并显示公司话术库的最后同步时间
- Not done / risks: 「同步」 is the existing company 话术 library sync; there is no sync of your own data between devices (data stays on this device by design).
- Next step: 无
