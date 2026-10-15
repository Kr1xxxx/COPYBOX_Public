# 账号: 「按住显示」 and 「显示」 buttons

- Date: 2026-10-15 · Thread/agent: 功能 · 账号显示改两个按钮
- What changed: Hidden 账号 values (登录 password, API 密钥 fields, 恢复码, and the Mac 秘密 row) now have two text buttons from one shared `app/reveal-buttons.tsx`: 「按住显示」 shows the value only while pressed (max 5 s, as before), 「显示」 keeps it shown until clicked again (it then reads 「隐藏」) or the entry is folded. Replaces the single eye icon.
- User-visible change (plain Chinese, for the preview changelog): 账号里的密码、密钥、恢复码改成两个按钮：「按住显示」松手就藏起来，「显示」点一下一直显示，再点「隐藏」；收起这一条后会自动藏回去。
- Not done / risks: Not tried on a real Windows or Mac machine (touch screens: long press is handled, context menu suppressed).
- Next step: 无
