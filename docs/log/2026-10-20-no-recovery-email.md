# Remove the 找回邮箱 and dead code

- Date: 2026-10-20 · Thread/agent: 功能 · 去掉找回邮箱
- What changed: removed the 找回邮箱 field, the never-working reset mail and their helpers (`app/account-lock.ts`,
  `app/account-lock-ui.tsx`, `app/account-encryption.ts`); old records drop the email at their next write (D-107).
  Also removed ~40 CSS rules nothing references and two uncalled functions (`canScanQr`, `isMarkOfSample`).
- User-visible change (plain Chinese, for the preview changelog): 设置账号页密码时不再要填找回邮箱；忘记密码只用恢复码找回（重置邮件从来发不出去，已去掉）
- Not done / risks: from audit #20, not done here: the PR-only `merge-policy` CI job + `scripts/classify-pr.mjs`
  (needs the owner's word on a CI change), merging `device_key.rs` into `secret_store.rs` (Rust, cannot be tested
  here, touches the Windows device key), and the source-text tests (need e2e coverage checked first).
- Next step: 无
