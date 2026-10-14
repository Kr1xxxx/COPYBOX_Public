# Preview: ship image-store's imports

- Date: 2026-10-14 · Thread/agent: coordinator (resume v1.71 release)
- What changed: `tools/preview/build.mjs` now compiles `app/image-store.ts` together with its runtime imports
  (`compileModuleTree`), so the preview no longer requests `folder-short-name.ts` (404) and the 补齐 10 张测试图 button
  works again. Preview bumped to v1.72.
- User-visible change (plain Chinese, for the preview changelog): 网页测试版「补齐 10 张测试图」按钮修好了
- Not done / risks: 无
- Next step: 无
