# Ponytail: lite at start, review before merge

- Date: 2026-10-21 · Thread/agent: 配置 · Ponytail 默认 lite
- What changed: `AGENTS.md` ("Before you start" step 5, "Merging") and `README.md` now say: ponytail auto-starts at `full`, `.claude/settings.json` is not changed because Claude cannot edit it, so every code task runs `/ponytail lite` first and `/ponytail-review` on its diff before merging.
- User-visible change (plain Chinese, for the preview changelog): 无（内部整理，页面没有变化）
- Not done / risks: ponytail still starts at full by itself; the lite switch relies on each session following AGENTS.md.
- Next step: 无
