### D-108 设置里有「检查更新」按钮 (2026-10-21)
- Context: the app only looked for a new version on launch and once a day (D-102), so an installed copy could sit
  on an old version for hours with no way to ask. Krix's Mac missed internal 2.0.57 this way.
- Decision: 设置 › 关于 has a 「检查更新」 row (both platforms, wherever the shell has `checkUpdate`). The click runs
  the same check the banner uses (`UpdateNotice`, via the `clipbox:check-update` event); the row then says
  「已是最新版本」, 「没能连上，稍后再试」 or 「这个版本不检查更新」. A newer version brings back the normal banner
  (立即更新 / 稍后 / 下载, even after an earlier 稍后) and the settings close so it can be seen. A failed check
  leaves a banner that is already showing alone.
- Not changed: no new shell command, no new dependency, the launch and daily checks, the install path (D-047, D-078).
