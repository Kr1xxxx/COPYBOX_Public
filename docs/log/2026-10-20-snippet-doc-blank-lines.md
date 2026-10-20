# 话术 documents keep blank lines and symbol lines

- Date: 2026-10-20 · Thread/agent: 優化 · 話術導入保留空行
- What changed: `app/snippet-doc.ts` keeps blank lines inside a titled 话术 and reads `\`-escaped lines (`\##`, `\>`, `\---`, `\**…**`) as text; the 话术 document export adds those escapes, so export → import round-trips (D-091). Template updated.
- User-visible change (plain Chinese, for the preview changelog): 导入话术文档时，话术中间的空行会保留；分享成文档再导入，内容和原来一样
- Not done / risks: leading spaces of a line are still trimmed on import (as before).
- Next step: 无
