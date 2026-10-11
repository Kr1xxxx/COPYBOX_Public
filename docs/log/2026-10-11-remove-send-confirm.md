# Removed 发送前确认 (the "已确认 …" tick list)

- Date: 2026-10-11 · Thread/agent: 【話術】話術功能與測試版
- What changed: Lock asked to delete the 发送前确认 block (tick boxes like 已确认 Product / 已确认 Quantity). It is no longer drawn on a card and copying no longer waits for those ticks (`snippetCopyReadiness` lost the `checkedInputs` argument and `missingChecks`). The stored `requiredInputs` field is untouched, so no data changes and no migration. The separate 发送前核实 tick (shown when the note says to verify prices etc.) is unchanged.
- User-visible change (plain Chinese, for the preview changelog): 去掉了「发送前确认」和「已确认 …」的打钩，复制不用再勾选。
- Tests: unit test for readiness updated (the old assertion required the ticks; that behaviour was removed on purpose, by Lock's request); new e2e checks the block is gone.
- Not done / risks: 发送前核实 still exists; Lock may want it gone too (asked in the thread).
