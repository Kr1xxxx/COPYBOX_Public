# 迷你窗口图片页的「最近」

- What changed: 迷你窗口图片页的「最近」不再是灰的占位,点开显示最近复制过的图片(新的在前,最多 50 张);位置和大小不变。复制图片后立刻更新记录。
- User-visible change: 迷你窗口里切到图片,「最近」可以点了,里面是最近复制过的图片;还没复制过时显示「还没有复制过图片」。
- Files: app/image-folders-core.ts, app/image-library.ts, app/image-section.tsx, app/page.tsx (mini tabs only).
- Tests: tests/e2e/image-folders.e2e.mjs (mini window), tests/e2e/mini-tabs.e2e.mjs.
