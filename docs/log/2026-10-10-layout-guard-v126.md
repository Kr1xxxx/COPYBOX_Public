# 排版守卫适配 v1.26

- Date: 2026-10-10 · Thread/agent: 【工具】技能与合并规则
- What changed: `layout-guard.e2e.mjs` follows the new 验证码 entry (设置 → 关于 → tap version → 保险箱 → 验证码 → 添加账号). Images are added in the full window before switching to mini, so the mini image grid and opening a tile are really checked. A step that fails can no longer hide behind a `KNOWN` entry. The stale 添加账号 entry is removed (no issue fires there now). Ellipsis on mini image names is listed as by design. The variable popup does not exist in the mini window, so it is only checked in the full window.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: 1100×760 wide size still not covered.
- Next step: 无
