### D-091 话术 documents keep blank lines and escaped symbol lines (2026-10-20)
- Context (owner, 2026-10-20, asked to remove the shortcut in `app/snippet-doc.ts`): importing a 话术 document
  dropped blank lines inside a 话术, and a body line starting with `##`, `**…**`, `>` or `---` was read as structure,
  so 「分享话术 → 文档」 did not always import back the same text.
- Decision: under a `**小标题**`, blank lines inside the text are kept (leading and trailing ones are still dropped);
  blocks without a `**小标题**` still split on a blank line. A body line starting with `\` followed by `#`, `>`, `*`,
  `-` or `\` loses that one `\` on import and is kept as text. The 话术 document export puts a `\` in front of every
  body line that would otherwise read as a heading, note, divider, title or start with `\`, so export → import
  gives back the same text.
- Effect: the company 标准话术库 (third edition, 142 entries, fixed STD- ids) parses exactly as before; existing
  data is untouched. Template: `docs/snippet-doc-template.md`.
