# 设置页：卡片式分组（参照 Claude 账户设置）

- Date: 2026-10-11 · Thread/agent: 【設置】设置页
- What changed: Settings groups are bordered cards (card header only where a page has several cards), rows keep label + description on the left and the control on the right with dividers, and each page has a large title. CSS plus a `settings-card` class and a page title in `app/settings.tsx`; no setting or behaviour changed.
- User-visible change (plain Chinese, for the preview changelog): 设置页分组更清楚：每组是一张带边框的卡片，每行左边是名字和说明、右边是操作，行与行之间有分割线，右侧顶部有大标题。
- Not done / risks: Shown to the owner as screenshots first; build only goes to the preview after approval. Layout change: add the `major` label on the PR.
- Next step: owner approves the look; the preview publisher takes the patch.
