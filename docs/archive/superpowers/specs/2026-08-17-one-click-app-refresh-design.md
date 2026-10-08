# One-click Application Refresh Design

## Goal

Upgrade the existing refresh button so one click reloads encrypted local data and restarts the desktop application onto the newest installed build. The user must not need to quit and reopen Clipbox manually.

## Chosen Approach

Use an Electron relaunch IPC bridge after the renderer has finished pending persistence and successfully reread the encrypted vault. A renderer-only page reload was rejected because the already-running local server can still serve the previous packaged runtime after a new app bundle is installed. Relaunching the application is the smallest reliable way to load the newest installed resources.

Before relaunch, save a one-shot UI context containing the current content kind, directory, product filter, and search query. On the next renderer load, consume and immediately delete that context, then validate the restored directory against the newly opened vault.

## Behavior

1. The user clicks the existing refresh button.
2. Clipbox cancels active drag operations and waits for queued encrypted writes.
3. Clipbox rereads and validates the local encrypted vault.
4. In the desktop app, Clipbox stores the one-shot UI context and asks Electron to relaunch.
5. Electron stops the old local server, exits, and opens the installed application again.
6. The new renderer consumes the saved context and restores the current view.

If vault reading fails, Clipbox does not relaunch and retains the current in-memory data. If the desktop bridge is unavailable, the existing in-page data refresh remains the fallback.

## Interface and Feedback

The button stays in its current location and retains its refresh icon. While working, it remains disabled and shows the existing rotating feedback. Its accessible label changes from data-only wording to “重新加载本地数据和软件”. No extra confirmation dialog is added because refresh is reversible and user-initiated.

## Data and Privacy

The encrypted vault format does not change. The temporary UI context contains only view state, uses a dedicated local-storage key, and is deleted immediately after the next launch. No secret-item content is added to it.

## Verification

- A failing unit test first proves refresh-context parsing and validation are absent.
- Desktop bridge wiring is covered by a focused source/contract test.
- Full tests, lint, and desktop packaging must pass.
- In the installed app, select a non-default directory and product filter, click refresh, confirm the Electron process changes, confirm v0.2.5 opens automatically, and confirm the view state is restored.
