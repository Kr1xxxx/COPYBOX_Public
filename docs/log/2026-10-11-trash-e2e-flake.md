# Fix a flaky 图片 回收站 e2e test

- Date: 2026-10-11 · Thread/agent: 【圖片】宮格與動效
- What changed: tests/e2e/images.e2e.mjs, test "the 回收站 empties itself after the chosen days": after deleting the second image the test reloaded the page at once. The delete is written to the store first and the row disappears afterwards, so under load the reload could cut the write off: the image stayed in 全部图片, the 回收站 was empty and `toHaveCount(1)` failed. The test now waits for the row to go before it reloads. One assertion that could pass before the page had updated (`not.toContainText("1")`) is now an exact `toHaveText("回收站")`. No app code changed: the app writes before it removes the row, so a deleted picture is never lost, the test was just too fast. Reproduced before the fix (1 failure in about 60 runs at 12 workers on 4 cores); 0 in 115 runs after.
- User-visible change: none.
- Not done / risks: other image tests fail now and then when the machine is overloaded (10+ workers on 4 cores: copy status, card scroll, folder drag); they are timing limits, not related to the 回收站.
- Next step: none.
