# 数据 page, fewer 加密, one name, readable small text

- Date: 2026-10-20 · Thread/agent: 文案 · 數據頁與統一叫法
- What changed: 设置 → 数据 split into 备份与恢复 / 导入话术 / 本机数据 with 完整备份 as the one main button and the
  single-part exports folded under 更多 (D-103). 加密 wording removed outside the 安全 page; 变量 → 高亮块 in tips,
  the empty page and the fill field label. All font sizes under 12px raised to 12px; light grey text darker. The
  first-run guide now points to 设置 → 安全 (not 数据) for the 账号 password.
- User-visible change (plain Chinese, for the preview changelog): 设置 → 数据 只留「完整备份」一个主按钮，单独导出收进「更多导出和导入」；除安全页外不再到处写「加密」；要填的地方统一叫「高亮块」；小字加大、灰字加深。
- Not done / risks: e2e run only for the touched specs (light testing); the layout detector now skips content inside a
  closed <details> (`checkVisibility`), which Chromium reports with a box but does not draw.
- Next step: 无
