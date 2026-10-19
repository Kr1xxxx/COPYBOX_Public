# COMELYLASH default AI prompts

- Date: 2026-10-19 · Thread/agent: AI · 接口与提示词
- What changed: `DEFAULT_AI_PROMPTS` (app/ai-config.ts) now carry the COMELYLASH B2B script rules: short, casual US English, one question at the end, I'll not We'll, no invented prices or claims, fill blocks kept; v2.18 checked them rule by rule against the comelylash-b2b-sales-scripts rules and the import template (greetings, reasons when asking, specifics, follow-ups, after-sales, group messages, no reply times, half-width punctuation, 【】 to [ ]). Settings saved with the old built-in prompts read as the new ones; prompts a person wrote stay. The prompt boxes in Settings → AI are taller.
- User-visible change (plain Chinese, for the preview changelog): 设置 → AI 的润色和整理提示词换成按 COMELYLASH 话术规则写好的版本，以前保存过旧默认提示词的也会自动换成新的
- Not done / risks: the private build's built-in AI interface still has empty secrets, so staff only get AI 润色 once Krix fills CLIPBOX_AI_BASE_URL / CLIPBOX_AI_MODEL / CLIPBOX_AI_KEY (AI 整理 falls back to rule-based tidying).
- Next step: 无
