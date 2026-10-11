# The standard 话术 folders can be sorted

- Date: 2026-10-11 · Thread/agent: 【圖片】宮格與動效
- What changed: Lock asked to be able to hold the mouse on the (seven standard) 话术 folders and drag them. They now have the six-dot handle in the sidebar and in Settings, drag and click-menu (上移 / 下移) work like for any other folder; rename and delete stay blocked. `normalizeSnippetFolderList` no longer forces the standard folders to the front when the saved list already has all seven (D-035); an incomplete or older list is rebuilt as before. Tests: core (full list keeps order, incomplete list rebuilt, twice-normalised unchanged, fresh vault standard order), e2e (drag a standard folder, order survives a reload, 上移 greyed at the top, rename/delete still disabled), the old "standard folders have no handle" assertions in main-flows and settings e2e and the settings source test were updated to the new rule. Not a storage-format change: the same saved array, read without re-forcing the order.
- User-visible change (plain Chinese, for the preview changelog): 标准的七个话术目录也能拖动排序了（按住左边的六点把手拖，或点一下选上移/下移），顺序会记住；它们仍然不能改名或删除。
- Not done / risks: places that list the standard folders in a fixed order on their own (the import preview, the 话术 editor's folder choice) keep the fixed order. Not looked at on a real desktop. Local work, not pushed.
- Next step: 【話術】 publishes it.
