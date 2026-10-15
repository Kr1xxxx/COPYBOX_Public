# 更新通知 card and brand-style popups

- Date: 2026-10-15 · Thread/agent: 「更新通知 · 弹窗」
- What changed: New 更新通知 card (D-070): shown once after an app update (lines from `app/release-notes.ts`) or after a
  同步码 sync whose library carries a `notice` (`sync:publish --notice`). All popups now use the brand-guidelines look
  (palette, Poppins / Lora with Chinese fallback); layout unchanged. Workflow in docs/whats-new.md.
- User-visible change (plain Chinese, for the preview changelog): 新增更新通知：软件更新或公司推送话术后，弹一个小卡片说明新增了什么，只弹一次；所有弹窗换成统一的新配色和字体
- Not done / risks: Poppins / Lora are not bundled, so most computers show Arial / the system font. `RELEASE_NOTES` is empty: the first notice is written for the next build and approved by the owner.
- Next step: draft the notice for the next private build and get the owner's OK before packaging.
