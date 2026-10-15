### D-070 更新通知 after every push; every popup in the brand style (2026-10-15)
- Context (owner, 2026-10-15): 「每次从我下发到账号里的更新，你都要做一个通知，简单说下有什么变动」 — only notable
  additions (a new feature such as 话术分享, 新增多少话术 / 多少 Tips), no button or design tweaks, no notice for old changes;
  he approves each text and it ships with the change. 话术 arrive without a software update, so the notice must come with
  them. All in-app popups are to be designed with the brand-guidelines skill.
- Decision:
  - App updates: `app/release-notes.ts` lists the lines per app version. After an update the app shows the lines of every
    version since the one it last saw, once (`clipbox.whats-new.v1`); a new install shows nothing; an app updated from a
    build without notices shows only its own version's lines.
  - 同步码 pushes: the library file may carry `notice: {id, title?, items}`; `npm run sync:publish -- --notice <file>`
    adds it with a new id per push. A device shows it once, and not when it is getting that library for the first time.
  - The card: title, one short line (version, or 「不用更新软件，已经自动同步好了」), up to 6 lines, 知道了.
  - Brand look for popups (backup, delete, consent, import, copy, Tips, first-run guide, 更新通知; settings only its title):
    Anthropic palette (#141413 / #faf9f5 / #b0aea5 / #e8e6dc, accents #d97757 / #6a9bcc / #788c5d), Poppins titles and
    Lora text with the system Chinese font behind them, dark primary button (light in dark mode). Layout is unchanged.
- Consequences: no notice ships without the owner's approval (docs/whats-new.md). The fonts are not bundled, so most
  computers show Arial / the system font; danger buttons stay red. Old changes get no notice.
- Status: Accepted.
