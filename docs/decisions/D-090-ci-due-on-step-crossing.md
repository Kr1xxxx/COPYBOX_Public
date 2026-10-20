### D-090 CI on main runs when VERSION crosses a 0.05 step (2026-10-20)
- Context (owner, 2026-10-20: 「每 5 个版本跑一次检查 … 这个优化一下」). #256 ran CI, the Tauri build and the Windows
  smoke test on main only when `tools/preview/VERSION` was exactly a multiple of 0.05. Two merges landing together
  can jump past it (2.39 → 2.41), and that round then never ran.
- Decision: on a push to main, `scripts/ci-due.mjs` reads VERSION at the previous main commit (`github.event.before`)
  and runs the checks when the new VERSION is in a later 0.05 step (2.39 → 2.40, 2.39 → 2.41, 2.44 → 2.46 all run;
  2.40 → 2.41 does not). If the previous VERSION cannot be read (first push, force-push), it falls back to the
  exact-multiple rule. Unchanged: nothing runs on pull requests, a run started by hand always goes ahead, private
  workflows stay dispatch-only.
