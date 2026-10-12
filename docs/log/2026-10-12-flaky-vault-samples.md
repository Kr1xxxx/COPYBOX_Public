# Fix the flaky 清除测试内容 e2e test (a real save race)

- Date: 2026-10-12 · Thread/agent: 【工程】代碼整理
- What changed: The encrypted stores (`totp-store`, `secret-items-store`) kept one write queue per store object, but the panels and the example seeding each open their own, so a seeding or clear that read the list, waited on slow key derivation and then wrote it back could erase an entry saved at the same moment (the test saw 3 examples instead of 4). Stores on the same storage key now share one queue (`app/store-queue.ts`), have an `update(change)` that reads and writes in one step, and restoring/clearing examples use it. The test itself now waits for the examples to be written before it starts and checks the toasts through a recorder instead of catching a two-second element; no assertion was removed or loosened. Two new unit tests fail without the fix.
- User-visible change (plain Chinese, for the preview changelog): 无（修的是极少数情况下，刚打开账号页马上新增条目，新增的内容可能被示例写入覆盖）
- Not done / risks: Restoring a backup (`page.tsx`) still reads both lists and then calls `replaceAll`; it is an explicit action and replaces everything on purpose. Each read/write derives its key with 310k PBKDF2 rounds, which is why the first open is slow on a busy machine; not changed (encryption format).
- Next step: 无
