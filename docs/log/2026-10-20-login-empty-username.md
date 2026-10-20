# 登录可以不填用户名（第二次保存才保存）

- Date: 2026-10-20 · Thread/agent: 修复 · 账号空用户名保存提示
- What changed: The login editor (both platforms) and 「转为登录」 no longer require 用户名 / 邮箱. With it empty, the first 保存 shows an inline hint that says pressing 保存 again saves; any edit resets it. The opened login hides the 用户名 row when it is empty. `loginDraftProblems` drops the username rule.
- User-visible change (plain Chinese, for the preview changelog): 账号的登录信息可以不填用户名 / 邮箱：第一次按「保存」先提示，再按一次就保存（转为登录也一样）
- Not done / risks: 无
- Next step: 无
