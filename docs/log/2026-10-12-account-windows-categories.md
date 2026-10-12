# Windows 账号: no API 密钥 / 恢复码 category

- Date: 2026-10-12 · Thread/agent: 【安全】 Mac 版 2FA
- What changed: on Windows (`PLAIN_NOTES`) the 账号 sidebar 分类 and the 新增 type menu drop API 密钥 and 恢复码 (`categoryList` in `app/page.tsx`). Existing entries of those types stay under 全部. Mac unchanged. D-038 updated.
- User-visible change (plain Chinese, for the preview changelog): Windows 的账号页去掉了「API 密钥」和「恢复码」两个分类，只剩登录、收款信息、验证码。
- Not done / risks: 已有的 API/恢复码条目不会被删，只能在「全部」里看到。
- Next step: 无
