# Folder drag test: wait for Settings to list the folders

- Date: 2026-10-12 · Thread/agent: 【工程】代碼整理
- What changed: In the 图片 test "folders can be dragged by the three-bar handle...", the check that Settings lists the same order read the list once, right after opening the 目录 tab, but Settings fills that list a moment later; on a busy machine (8 workers on 4 cores) it failed about 1 run in 5. It now polls until the list shows the order (same expected value). The drag itself and the saved order were fine: 40 of 40 runs pass.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: 无
- Next step: 无
