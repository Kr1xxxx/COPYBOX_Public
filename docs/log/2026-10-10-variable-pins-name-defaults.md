# Variable pins, Name defaults, copy button tick

- Date: 2026-10-10 · Thread/agent: 【話術】話術功能與測試版
- What changed: variable blocks get a `?` hint and right-click pinning (pinned values are never pushed out and are kept on the device); `Name` starts as Friend and shows beautiful / Friend / Lovely above the block; the big 复制 button keeps its size when it turns to 已复制 and the tick draws itself. Pure rules in `app/variable-memory.ts`, decision D-027.
- User-visible change (plain Chinese, for the preview changelog): 变量块最右边有个问号，说明最多记 3 个值；右键变量块（或列表里的值）可以固定，固定的不会被新值顶掉，下次打开还在；Name 默认是 Friend，点 Name 块上方弹出 beautiful / Friend / Lovely，不选直接复制就是 Friend；复制按钮复制成功后打钩动效，按钮不再变大。
- Not done / risks: the recent values are still forgotten when the page is closed or reloaded (on purpose: customer names); I could not reproduce "the memory vanished" by clicking alone (4 rounds on a 420 px window kept all 3). Likely causes: a reload or a new preview version wipes the in-memory list (pins now survive that), and picking a value moves the cursor to the next empty block, whose list is empty, so the list disappears (not changed).
- Next step: Lock checks whether the memory still disappears in the preview.
