# Set variable blocks by hand when adding a 话术

- Date: 2026-10-10 · Thread/agent: 【話術】話術功能與測試版
- What changed: in the 话术 editor, selected words can be set as a highlighted variable block with 设为高亮 (wraps them in [ ]) and taken off again with 取消高亮; a line under the text names the blocks. A 话术 typed by hand that has blocks gets a `snippetMeta` on save (existing optional field, nothing else about it changes), so the open card shows fillable blocks. Pure rules in `app/snippet-variables.ts`.
- User-visible change (plain Chinese, for the preview changelog): 手动添加或编辑话术时，选中一段文字点「设为高亮」，它就变成复制时可以填写的高亮块；光标放在高亮块里点「取消高亮」可以还原；编辑框下面会列出有哪些高亮块。
- Not done / risks: only the English text can be marked (the 中文对照 box is not covered); after the first save with a block the 话术 counts as a structured one, so its editor shows 核心动作 and 中文对照 like imported ones; not pushed (upload freeze).
- Next step: Lock tries it in the preview.
