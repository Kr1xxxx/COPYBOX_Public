# Web preview

A browser build of Clipbox for looking at a branch without installing anything. `index.html` shows the real app
in a frame with a Windows / Mac switch; the desktop shell is faked by a small script. Nothing is added on open (owner, 2026-10-14):
the 补齐 10 张测试图 button adds simulated test images through the app's own image store (`seed.js`), and the update
notice never shows. The 导入测试话术 menu opens the app's real import
dialog with one of four sample sheets: three short groups in `samples/` and the full test sheet from `docs/samples/`. It is a snapshot of the branch being reviewed,
built from that branch's code.

## Version

The number in `VERSION` is shown top-left of the page. It goes up by 0.01 with every update, and the owner is told
the number at the end of every report. **Only the preview publisher (the 【話術】 thread) edits `VERSION` and
`changelog.json`**; feature PRs describe their visible change in their `docs/log/` note instead, and the publisher
collects those notes into the changelog.

Every bump of `VERSION` also needs a new entry at the top of `changelog.json` (version, date, short plain-Chinese
items). The preview page shows that file as the 版本更新 panel on the left, newest first, so the owner can see what
each version changed. Add `"at": "YYYY-MM-DD HH:MM"` (China time) to the entry: it is the update time shown in Settings → 关于 and in the page header (without it the build time is used).

## Build and try it

```bash
npm run build            # the preview needs a finished build (dist/client/_next)
npm run preview:build    # writes dist-preview/ (index.html, app-win.html, app-mac.html, assets/, files.json, ...)
npm run preview:serve    # http://127.0.0.1:8080/index.html  (or: npm run preview:serve -- 8099)
```

`preview:build` starts `vinext start` on a free port, saves the server-rendered page, and stops that process again.
The local server sends `charset=utf-8` and `Cache-Control: no-store`, so it behaves like the published page.

## Publish as an Artifact

- `dist-preview/index.html` is the page; every other file is listed in `dist-preview/files.json` and goes in `files`
  (published path -> file in `dist-preview/`).
- To update, publish again with the same `url` so the link stays. Files that no longer exist must be passed as `null`.
- Two gotchas: published folder names must not start with `_` (that is why `_next` becomes `assets`), and every
  file must be UTF-8. The two Next.js files `_buildManifest.js` and `_ssgManifest.js` are left out on purpose (not needed).
