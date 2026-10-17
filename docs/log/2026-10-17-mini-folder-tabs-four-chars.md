# Mini window folder tabs show four characters

- Date: 2026-10-17 · Thread/agent: 檢查 · 目录名称显示四个字
- What changed: The mini window's folder tabs show up to four characters instead of two (`app/folder-short-name.ts`,
  D-074); the standard 话术 folders show their whole names, and own short names may be up to four characters
  (「最多四个字」). This is what the owner meant on 2026-10-16; #218 had widened the main sidebar instead.
- User-visible change (plain Chinese, for the preview changelog): 迷你窗口的目录标签显示四个字（如「询盘接待」「开场接待」），不再只显示两个字；自己设的简称也可以写到四个字
- Not done / risks: More tabs need sideways scrolling in the mini window. Not checked on a real Windows or Mac yet.
- Next step: Ships with the next staff build.
