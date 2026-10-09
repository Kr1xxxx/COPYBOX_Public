# Web preview

A browser build of Clipbox for looking at a branch without installing anything. `index.html` shows the real app
in a frame with a Windows / Mac switch; the desktop shell is faked by a small script, and ten simulated test
images are added through the app's own image store (`seed.js`). The 导入测试话术 menu opens the app's real import
dialog with one of four sample sheets: three short groups in `samples/` and the full test sheet from `docs/samples/`. It is a snapshot of the branch being reviewed,
built from that branch's code.

## Version

The number in `VERSION` is shown top-left of the page. It goes up by 0.01 with every update, and the owner is told
the number at the end of every report.

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
