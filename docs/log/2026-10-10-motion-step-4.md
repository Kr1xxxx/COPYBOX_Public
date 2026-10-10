# Motion from arc-library, step 4 of 4 (D-021)

- Date: 2026-10-10 · Thread/agent: 【圖片】宮格與動效
- What changed: the drop-a-file overlay in 图片 fades and scales in and fades out (`app/arc/drop-hint.tsx`, `AnimatePresence`); the first-run panel's title, text and buttons settle one after another. Nothing moves under reduced motion. Deliberately left as they are: the rename field (appears on every rename, so no entrance), the search box (already has a focus-ring transition), the counters (already tabular numbers; they change on every keystroke, so no animation), the existing empty-state rise for plain "nothing here" panels.
- User-visible change (plain Chinese, for the preview changelog): 拖入图片时的提示框淡入淡出;第一次打开时的欢迎页内容依次出现。
- Not done / risks: dialogs still have only their CSS entrance (no exit animation); not looked at by eye, only measured in the e2e tests.
- Next step: none for motion unless the owner wants dialog exits.
