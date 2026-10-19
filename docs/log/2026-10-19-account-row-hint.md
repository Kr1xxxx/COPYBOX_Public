# Settings 账号 row: drop the hint line

- Date: 2026-10-19 · Thread/agent: 介面 · 账号提示精简
- What changed: Settings → 概览 → 账号与同步 → 账号 row no longer shows the small grey line listing categories and the lock state (「登录、收款信息、API 密钥、验证码、恢复码和笔记 · 打开时先滑动解锁」). The list was out of date (地址 is missing; Windows has no API 密钥) and the 安全设置 / 打开账号页 buttons next to it already say what the row is for. `app/settings.tsx` only.
- User-visible change (plain Chinese, for the preview changelog): 设置里「账号」那一行去掉了下面的灰色说明小字（分类列表和解锁方式），只留标题和两个按钮
- Not done / risks: 无
- Next step: 无
