# Handoff notes

One file per pull request: `docs/log/YYYY-MM-DD-short-name.md` (lower-case, digits and hyphens). Create a **new**
file; never edit someone else's note and never edit `docs/handoff-log.md` (frozen history before 2026-10-09).
Two PRs then never touch the same lines, so they cannot conflict here. CI fails an app/desktop PR without a new note.

Template:

```markdown
# <short title>

- Date: 2026-10-09 · Thread/agent: 【類別】標題
- What changed: <1–3 sentences>
- User-visible change (plain Chinese, for the preview changelog): <one line per change, or "无">
- Not done / risks: <or "无">
- Next step: <or "无">
```

The "User-visible change" line is what the preview publisher (【話術】) turns into a `tools/preview/changelog.json`
entry. Feature PRs do not write the changelog and do not bump `tools/preview/VERSION`.
