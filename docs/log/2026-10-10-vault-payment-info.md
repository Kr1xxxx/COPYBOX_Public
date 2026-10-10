# 保险箱 and 收款信息 (Mac)

- Date: 2026-10-10 · Thread/agent: 【安全】Mac 版 2FA
- What changed: the hidden 验证码 dialog is now the 保险箱 with tabs 验证码 and 收款信息. 收款信息 has its own encrypted store (`app/secret-items-store.ts`, key `clipbox.vault-items.v1`), checks (`app/payment-core.ts`) and a panel (`app/payment-panel.tsx`). The old `clipbox.totp.v1` data is untouched. See D-030.
- User-visible change (plain Chinese, for the preview changelog): Mac 版隐藏的"验证码"改名"保险箱"，新增"收款信息"：银行电汇、PayPal、Wise 等，IBAN 和 SWIFT 自动检查，每个字段可单独复制，也可一键复制英文整段；修改要再确认一次。
- Not done / risks: not in backups; 账号密码, 验证码补强 and API 密钥 are the next patches; never run on a real Mac (D-014).
- Next step: patches for the other three types.
