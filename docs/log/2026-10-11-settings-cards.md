# 设置页：卡片式分组（参照 Claude 账户设置）

- Date: 2026-10-11 · Thread/agent: 【設置】设置页
- What changed: Settings groups are borderless sections like Claude's settings (a heading only where a page has several groups), rows keep label + description on the left and the control on the right with dividers, and each page has a large title. CSS plus a `settings-card` class and a page title in `app/settings.tsx`; no setting or behaviour changed.
- User-visible change (plain Chinese, for the preview changelog): 设置页参照 Claude 重新排版：没有外框，每行左边是名字和说明、右边是操作，行与行之间有分割线，右侧顶部有大标题；左侧顶部新增「搜索设置」，输入后直接列出相关设置。
- Not done / risks: Shown to the owner as screenshots first; build only goes to the preview after approval. Layout change: add the `major` label on the PR.
- Next step: owner approves the look; the preview publisher takes the patch.

- Also in this note: all `<select>` dropdowns (AI 常用服务, 账号 add form, TOTP, legacy-entry sort, item editor 目录) now use one flat style with a chevron instead of the system gradient/arrows; the mini-window and 图片 folder selects already did. Settings search (`tests/e2e/settings-search.e2e.mjs`) filters sections and rows by text.
