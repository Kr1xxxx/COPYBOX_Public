# Remove unused template dependencies

- Date: 2026-10-13 · Thread/agent: W6 (coordinator task, review item 12, owner approved "执行下")
- What changed: Removed the template leftovers nothing used: `drizzle-orm`, `drizzle-kit` (and the `db:generate`
  script), `@cloudflare/vite-plugin`, `wrangler` (and `WRANGLER_LOG_PATH` in the npm scripts and
  `scripts/tauri-frontend.mjs`), `@tailwindcss/postcss` and `tailwindcss`. Tailwind was never compiled (no PostCSS
  config), so `@import "tailwindcss"` only shipped its preflight reset plus a theme block and an `@tailwind utilities`
  directive that browsers ignore. The first line of `app/globals.css` is now that reset written out in `@layer base`,
  with the same rules the browser actually applied (code/kbd/samp/pre inherit the page font, as Chromium did with the
  unresolved `--theme()` values). Lockfile regenerated with npm: 170 packages removed, none added or changed;
  `node_modules` 625 MB → 330 MB; built CSS 142,746 → 124,302 bytes (gzip 27,315 → 22,781).
- Checked: screenshots before/after (Windows and Mac × light and dark: list, open card, 设置, 设置·窗口, 账号, 图片 grid,
  mini window; 28 shots at 680×620 / 360×440) are pixel-identical.
- User-visible change: 无（安装更快、更小）
- Not done / risks: On macOS (WebKit) the old unresolved `--theme()` font rule for `code` was probably dropped, so the
  账号 recovery code (`.recovery-code-text`) may have shown in a monospace font there; it now uses the page font on both
  platforms, as on Windows. Not checked on a real Mac. Full Tauri build not run (no Rust toolchain here); its frontend
  step (`scripts/tauri-frontend.mjs`) only runs vinext build/start.
- Next step: 无
