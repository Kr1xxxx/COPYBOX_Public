# 设置里的检查更新按钮

- Date: 2026-10-21 · Thread/agent: 功能 · 设置里检查更新按钮
- What changed: 设置 › 关于 got a 「检查更新」 row (`app/settings.tsx`) that asks `UpdateNotice` (`app/update-notice.tsx`)
  to run its existing check now, through the `clipbox:check-update` event; D-108. No Rust, bridge or dependency
  change. New e2e tests in `tests/e2e/update-notice.e2e.mjs` (up to date on both platforms, newer version, failed check).
- User-visible change (plain Chinese, for the preview changelog): 设置 › 关于 新增「检查更新」按钮，点一下马上看有没有新版本
- Not done / risks: not tried on a real Windows or Mac shell; the check itself is the old `check_update` command.
- Next step: Opus review, then Krix looks at the preview.
