# Upgrade dev dependencies (audit item E)

- Date: 2026-10-15 · Thread/agent: 維護 · 升級開發依賴(審計 E)
- What changed: Upgraded vite 8.0.13 → 8.3.4, vinext 1.0.0-beta.2 → 1.2.0, @vitejs/plugin-rsc 0.5.26 → 0.5.37,
  @vitejs/plugin-react 6.0.2 → 6.1.2, @next/eslint-plugin-next 16.2.6 → 16.4.1 and react / react-dom /
  react-server-dom-webpack 19.2.6 → 19.2.9 (same minor; the server-dom package must match React). Transitive fixes
  for fast-uri, js-yaml, source-map-js and brace-expansion via `npm audit fix`. vinext 1.1+ refuses to build without
  a Vite config, so `vite.config.mjs` (the plain `vinext init` default) was added. vinext 1.2 pulls in
  `@vercel/og` → satori, which pins fflate 0.7.3 (moderate advisory); an `overrides` entry moves it to 0.7.5.
  vinext 1.2 moved Vite's preload helper from the index chunk into the vinext chunk, so `tools/preview/build.mjs` now
  finds it by content instead of by file name (unit test added). `npm audit`: 14 high → 7 high, all one chain; `npm audit --omit=dev` stays 0.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: The 7 remaining highs are all `braces` (GHSA-vfj7-8cjw-p6xm, every published version affected,
  no fix exists) reached through micromatch → fast-glob from @next/eslint-plugin-next and from vinext's
  vite-plugin-commonjs. Only build and lint tools use it, on glob patterns we write ourselves; nothing ships in the
  app. Re-run `npm audit` when braces publishes a fix. npm's suggested "fix" (downgrading the lint plugin to 14.2.35)
  would not remove braces, because vinext still needs it.
- Next step: 无
