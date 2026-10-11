# 设置「关于」显示版本号和更新时间

- Date: 2026-10-10 · Thread/agent: 【設置】设置页
- What changed: Settings → 关于 shows the version and an 更新时间 row (date and time). New optional bridge call `getBuildTime` (desktop: modification time of the installed app files; web preview: `at` of the newest `changelog.json` entry, else the build time). The 5-tap on the version for the Mac 验证码 is unchanged and tested. The preview header shows the time next to the version. Built on #52 (two-column Settings); merged main, so 共享话术 sits under 数据.
- User-visible change (plain Chinese, for the preview changelog): 设置 → 关于：显示当前版本号和这个版本的更新时间（日期和时间）。 Publisher: add `"at": "YYYY-MM-DD HH:MM"` (China time) to the new changelog entry; it is the time shown.
- Not done / risks: Not pushed (GitHub quota out). Desktop time is the install time of the app files, not a build stamp.
- Next step: publisher includes this branch in the next trial page; push and PR when GitHub is back.
