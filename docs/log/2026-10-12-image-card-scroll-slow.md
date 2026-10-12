# 图片卡片展开慢时也能滚到位

- What changed: 点开图片卡片后,原来只在 280 毫秒时滚一次;机器慢、卡片还没长完时就会滚少了而且不再纠正。现在卡片大小每变一次(安静一小会儿后)就重新对齐,最多持续 2 秒。
- User-visible change: 点开最后一行的图片,慢的电脑上卡片也会完整滚进视野。
- Files: app/image-section.tsx (展开后滚动的 effect).
- Tests: tests/e2e/image-grid.e2e.mjs 新增"展开很慢"用例(把展开动画拉长到 1.4 秒;没有修复时会失败),原有滚动用例不变。
