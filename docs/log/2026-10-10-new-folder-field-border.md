# 新建目录 field: border and placeholder fit in the sidebar

- Date: 2026-10-10 · Thread/agent: 【圖片】宮格與動效
- What changed: the field's accent ring was an outer `box-shadow`, and the folder list scrolls (overflow clips), so the left and right edges of the ring were cut off. The ring is now drawn inside the box (`inset`), for 新建目录 and rename in both 话术 and 图片. The placeholder "目录名称，回车创建" did not fit the 128 px sidebar and was cut to "目录名称，回…"; it is now "目录名称" and the hint "输入名称，回车创建" is the tooltip. The e2e test that checked the old placeholder text was updated to the new text (same intent: the field has a placeholder).
- User-visible change (plain Chinese, for the preview changelog): 新建目录的输入框边框完整显示,提示文字不再被截断。
- Not done / risks: checked in screenshots on Windows and Mac styling, light and dark (browser), not on a real Windows or Mac desktop. Local commit only (freeze).
- Next step: the publisher includes it in the next preview.
