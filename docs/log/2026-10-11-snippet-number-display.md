# Snippet numbers shown as #001

- Date: 2026-10-11 · Thread/agent: 【話術】話術功能與測試版
- What changed: Lock asked for numbers to start at #001 and for a sensible rule. The rule was already global, increasing, never reused, unchanged by moving or reordering, so only the display changed: `displaySnippetNumber` turns the stored `CB-0014` into `#014` (more digits past 999) on the selected card and in the editor. Search also finds #014, #14 and CB-0014. Existing numbers are kept (decided by default: no renumbering, no storage change).
- User-visible change: 话术编号显示成 #001。
- Not done / risks: the command-line tool and automation still use CB-0001.
