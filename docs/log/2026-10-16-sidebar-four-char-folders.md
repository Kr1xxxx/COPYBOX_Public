# Sidebar shows four-character folder names

- Date: 2026-10-16 · Thread/agent: 界面 · 目录显示四个字
- What changed: The sidebar is 144px wide instead of 128px (`app/globals.css`, `.sidebar`), so a four-character
  folder name (开场接待, 产品咨询) shows in full next to a two- or three-digit count on Windows and Mac; longer names
  still end in "…". New test `tests/e2e/sidebar-folder-names.e2e.mjs` (fails at 128px).
- User-visible change (plain Chinese, for the preview changelog): 左边「目录」能完整显示四个字的目录名（如「开场接待」），更长的才用 … 结尾
- Not done / risks: The list on the right is 16px narrower; the layout guard found no clipping. Not checked on a real
  Windows or Mac yet.
- Next step: Ships with the next staff build.
