# Removed 发送前核实 (the last tick before copying)

- Date: 2026-10-11 · Thread/agent: 【話術】話術功能與測試版
- What changed: after 发送前确认 went in v1.44, Lock's 「别一直等我回复了」 decided the single 发送前核实 tick also goes. Cards no longer draw it and copying only waits for empty variable blocks (`snippetCopyReadiness(item, values, language)`). Stored `requiresVerification` is untouched; no migration.
- User-visible change: 去掉了「发送前核实」的勾，复制不再等它。
