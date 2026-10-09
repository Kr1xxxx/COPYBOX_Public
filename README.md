# Clipbox

Clipbox is a local, encrypted copy box that opens instantly. It has two sections: 话术 (snippets — canned
customer-service replies) and a second section that is called 备注 on Windows and 秘密 on macOS.

> On Windows, 备注 is plain-text notes (content shown directly, no masking, references or segments).
> On macOS, 秘密 keeps masked content and copy-by-reference.

## Working on this repository

New developers and AI agents: read [`AGENTS.md`](AGENTS.md), then [`docs/HANDOFF.md`](docs/HANDOFF.md)
(status and task board) and [`docs/DECISIONS.md`](docs/DECISIONS.md) (product decisions already made).
The workflow is in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Run locally

Requires Node.js 22.18 or newer:

```bash
npm install
npm run dev
```

Then open `http://localhost:3000/`.

## Windows desktop app

```bash
npm run desktop:pack:win
```

Run it on Windows; the NSIS installer (`Clipbox Setup x.y.z.exe`) ends up in `release/`. The app starts its
local server internally and stores data in `%APPDATA%\Clipbox`. This has not yet been run on a real Windows
machine — watch for errors on the first build.

## macOS desktop app (Apple silicon only)

```bash
npm run desktop:pack
```

The app ends up in `release/mac-arm64/Clipbox.app`. It starts its local server internally — no browser needed —
and stores data in Clipbox's own macOS application-data folder.

## Features

- Opens without a password, using a random per-device key
- Keys derived with PBKDF2-SHA256 (310,000 iterations); every entry encrypted with AES-256-GCM
- Search, arrow keys to select, Enter to copy
- Copying never clears the clipboard afterwards
- If the vault cannot be read at startup, the original data and key are kept, an error is shown and you can
  retry; it is never silently replaced by an empty vault
- Add, edit and delete entries inline — no dialogs; moving to the trash can be undone for 6 seconds
- Snippets have an optional 小提示 (tip, up to 40 characters). Next to the content are AI 润色 (polish) and
  AI 整理 (tidy), both undoable. In Settings → AI pick a preset (OpenAI, DeepSeek, Gemini, Kimi, Zhipu GLM,
  SiliconFlow, OpenRouter, local Ollama) or enter any OpenAI-compatible chat/completions endpoint, model and
  API key, fetch the account's model list, and edit the two prompts (they cannot be empty). The key is encrypted
  by the OS and stays on the device. Without an endpoint the device's built-in model is used; without that,
  tidy falls back to rules and polish is unavailable
- Pinned entries first; "recently used" view
- Sidebar folders; folders can be created, renamed, recoloured, deleted and drag-sorted in the sidebar and in
  Settings (standard snippet folders are fixed, colour only); "select" mode moves or trashes in bulk
- Fill in [variables] before copying; the copy bar stays visible even with many variables
- Tray icon (Windows notification area / macOS menu bar): click it or "快速搜索" to open the mini window, which
  can hide again after copying; the close button either hides to the tray or quits; optional silent launch at login
- Full window at least 680×620; the mini button switches to a 360×440 always-on-top mini window whose position
  is remembered
- Search with several words, highlighted matches, in the current folder or everywhere
- Settings: system / light / dark theme, trash management, version, last export time, open the data folder
- No keyboard shortcut hints or modifier shortcuts
- Animations pause when the desktop window is unfocused, minimised or hidden, and after 30 s without input;
  the vault and local commands keep working
- The UI only exports the snippet backup; 秘密/备注 has no export button
- Backups are encrypted with their own password and never contain the device key; imports are decrypted and
  validated first, then merged or replaced; older backups are still accepted
- No accounts, no server, no remote database

## Letting other local tasks edit snippets (macOS/Linux)

While Clipbox is open, other local tasks can call the `clipbox` command. Changes go through the app's encrypted
write queue and show up immediately — no export, import or refresh. The command server does not start on Windows.

```bash
clipbox status
clipbox list
clipbox get CB-0003
clipbox add --title "报价跟进" --content "May I follow up on the quotation?" --folder "跟进"
clipbox update CB-0003 --title "新标题" --content "Updated message"
clipbox move CB-0003 --folder "成交"
clipbox delete CB-0003 --confirm
```

On macOS a 秘密 card can copy a stable reference instead of the secret itself. Another local task can read
exactly that entry:

```bash
clipbox secret get "clipbox://secret/<ID>" --json
```

The `--json` response contains the secret; the calling task should pass it straight to the target API and never
print it. Secrets cannot be listed, searched, bulk-read or modified through the command.

There is no in-app button for a secrets backup. When the user explicitly asks, a helper task can pass a separate
password on standard input and write the encrypted file for the current user; the command never prints the
secret or ciphertext and never overwrites an existing file:

```bash
printf '%s' '{"password":"at-least-eight-characters"}' | clipbox secret export --output "/target/clipbox-secrets.json" --stdin --confirm
```

Longer content or content with quotes can be passed as JSON on standard input:

```bash
printf '%s' '{"title":"报价跟进","content":"May I follow up?","folder":"跟进"}' | clipbox add --stdin
```

Every command accepts `--json` for structured output. Snippet numbers never change; delete and secrets export
require `--confirm`. The local interface reads a single secret only by its unguessable exact reference; it offers
no index of secrets and cannot read the device key. The interface closes when Clipbox quits.

## Security boundaries

The vault and the device key that decrypts it are both stored in Clipbox's local application data, so anyone
who can read that folder can decrypt the vault. Back up snippets and secrets separately before clearing app data.
Backup passwords are independent of the device key and cannot be recovered. Password-free startup favours
convenience on a personal device and does not protect against other programs or malware that can read the
current user's data, so do not use Clipbox as the only store for high-value secrets such as wallet seed phrases.

Protecting the device key with the operating system (Windows DPAPI) was built and then removed on the owner's
decision (D-015); it can be brought back from git history (PR #7). The installers are not code-signed and do not
update themselves (internal tool, D-013).

## Checks

```bash
npm run lint
npm test          # unit and source tests
npm run test:e2e  # browser end-to-end tests
```
