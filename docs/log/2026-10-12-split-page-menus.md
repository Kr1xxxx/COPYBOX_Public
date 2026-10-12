# page.tsx split: pop-up menu dismiss and placement

- Date: 2026-10-12 · Thread/agent: 【工程】代碼整理
- What changed: Moved the "close the pop-up menus on an outside click or Esc" effect and the "flip a row's ⋯ menu above the button when it runs past the window" effect out of `app/page.tsx` into the hooks `useDropdownDismiss` and `useRowMenuPlacement` (`app/dropdown-menus.ts`). Same code and same dependencies; no behaviour or layout change.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: 无
- Next step: 无
