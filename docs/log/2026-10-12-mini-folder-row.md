# Mini window: folders replace the 最常用 row

- Date: 2026-10-12 · Thread/agent: 【話術】迷你窗口顶部重排
- What changed: Lock asked for the folders to take the place of the small 最常用 snippet buttons under the search box. That row is now the folder row (sideways scrolling, press and drag), and the 最常用 buttons are gone from the mini window (`app/mini-favorites.ts`, its unit test and e2e test removed). The top row keeps the 话术/账号/图片 switch and 全部, 收藏, 最近. 图片 mini uses the same layout (folders and 未分类 under the search box). Only the mini window changes.
- User-visible change (plain Chinese, for the preview changelog): 迷你窗口:各个目录移到搜索框下面(原来「最常用」话术按钮的位置,可左右拖动),「最常用」按钮去掉;顶部一行只留 话术/账号/图片 和 全部、收藏、最近。
- Not done / risks: Removes the mini 最常用 feature Lock approved earlier, on his explicit request; the app-wide usage ranking (设置 → 数据) is untouched. Mouse drag not tried on real hardware.
- Next step: Lock looks at it in the web trial.
