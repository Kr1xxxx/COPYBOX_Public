# 话术搜索缓存

- Date: 2026-10-13 · Thread/agent: worker W5 (perf item 5, part 1)
- What changed: `app/snippet-search.ts` now keeps each snippet's search data (lower-cased fields, pinyin) in a `WeakMap` keyed by the snippet object instead of a 4,000-entry string cache that was cleared when full. Above ~1,333 snippets the old cache emptied itself on every search; now repeat searches reuse the work and an edited snippet (a new object) is re-read. Node timing, query "t": 1,500 snippets warm ~8–14 ms → ~6–9 ms; 3,000 snippets warm ~58–74 ms → ~6–8 ms (cold unchanged, ~90–185 ms). Tests: `tests/snippet-search-cache.test.mjs`.
- User-visible change: 话术很多时搜索更快
- Not done / risks: The first search after opening the app still does the full pinyin work (cold). This relies on snippets never being changed in place; `app/page.tsx` updates them with `{ ...item }` today.
- Next step: Speed up list rendering for large result sets (separate task, `app/page.tsx`).
