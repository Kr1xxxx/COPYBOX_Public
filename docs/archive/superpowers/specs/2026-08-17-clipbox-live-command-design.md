# Clipbox Live Command Design

## Goal

Allow other local Codex tasks to query and directly modify encrypted Clipbox snippets while the desktop application is open. The workflow must not use spreadsheet or backup export/import, must preserve fixed snippet numbers, and must update the visible application immediately.

## Scope

The first version supported snippet entries only. Version 0.2.15 adds exact-reference lookup for one secret at a time. It still does not expose a secret index, the device key, raw encrypted envelopes, arbitrary JavaScript execution, or general filesystem access.

Supported commands:

- `clipbox status`
- `clipbox list [--folder <name>] [--query <text>] [--json]`
- `clipbox get <CB-number> [--json]`
- `clipbox secret get <clipbox://secret/...> --json`
- `clipbox add --title <text> --content <text> [--summary <text>] [--folder <name>] [--chinese <text>]`
- `clipbox update <CB-number> [--title <text>] [--content <text>] [--summary <text>] [--folder <name>] [--chinese <text>]`
- `clipbox move <CB-number> --folder <name>`
- `clipbox delete <CB-number> --confirm`

Long or punctuation-heavy values may also be supplied as a JSON object on standard input. Human-readable output is the default; `--json` returns machine-readable output for other tasks.

## Chosen Architecture

Use a user-only Unix domain socket managed by the Electron main process. This was selected over an HTTP endpoint because it does not expose a network port or require CORS and bearer-token handling, and over a watched inbox directory because it gives synchronous success and error responses without polling or stale command files.

The socket exists only while Clipbox is running. It is created inside the Clipbox application-support directory with owner-only permissions. Stale socket files are removed during startup only after confirming that no live listener owns them. The socket is closed and removed on application quit.

Electron installs or updates a small launcher at `~/.local/bin/clipbox`, a directory already present in the user's PATH. The launcher connects to the socket, sends one bounded newline-delimited JSON request, waits for one response, prints the result, and exits with a nonzero status on failure. If Clipbox is closed, it reports that the application must be opened; it does not start the application automatically.

## Data Flow

1. Another task runs a `clipbox` command.
2. The CLI validates its arguments and sends a structured request to the Unix socket.
3. The Electron main process validates the envelope, assigns a request ID, and forwards the command to the active renderer through the preload bridge.
4. The renderer validates the snippet operation and applies it to the latest in-memory vault state.
5. The existing persistence queue encrypts and writes the updated vault to the same `localStorage` envelope.
6. Only after durable encrypted persistence succeeds does the renderer return a response through Electron to the socket client.
7. React state is already updated, so the open Clipbox list reflects the change immediately. A short toast identifies the externally modified snippet.

Commands are serialized in the renderer. A later command always sees the committed in-memory result of the previous command. This prevents two local tasks from overwriting one another with stale snapshots.

## Mutation Rules

- Lookup uses the fixed `CB-xxxx` number, case-insensitively. Internal UUIDs are never required by callers.
- Adding assigns the next permanent snippet number using the existing allocator.
- Updating is partial: omitted fields remain unchanged.
- Moving creates the destination snippet folder when it does not already exist and appends it to the existing folder order.
- Updating or moving never changes the fixed snippet number, creation time, pin state, product metadata, or ordering unless that field is explicitly supported by the command.
- Empty titles and empty English content are rejected.
- Duplicate fixed numbers, ambiguous targets, unknown fields, oversized requests, malformed JSON, and invalid folders return errors without changing data.
- Delete requires both the target number and `--confirm`. It deletes only one matching snippet.

## Security and Reliability

- The socket and its parent control directory use owner-only permissions.
- The protocol accepts a small allowlist of snippet operations and bounded UTF-8 JSON payloads.
- The renderer never sends the device key or encrypted envelope to the CLI.
- Secret entries remain filtered from list/get responses and rejected as mutation targets. A secret can only be read through its exact UI-copied `clipbox://secret/...` reference; there is no list, search, or bulk operation.
- Main-process requests time out if the renderer is unavailable.
- A response reports success only after the encrypted write resolves.
- Failure leaves the current in-memory and stored vault unchanged where possible; persistence errors are returned to the caller and shown in Clipbox.
- The existing application single-instance lock prevents two Clipbox processes from competing for the socket.

## Components

- `app/clipbox-automation.ts`: pure command validation and snippet mutation logic.
- `desktop/automation-server.cjs`: owner-only Unix socket lifecycle, request bounds, correlation, and timeout handling.
- `desktop/clipbox-cli.cjs`: argument parsing, optional JSON/stdin input, socket client, and output formatting.
- `desktop/automation-bridge.cjs`: correlates main-process requests with renderer responses and enforces readiness and timeouts.
- `desktop/main.cjs`: starts/stops the automation server and forwards correlated renderer requests.
- `desktop/preload.cjs`: exposes the narrow receive/respond bridge to the renderer.
- `app/page.tsx`: serializes external commands, calls the pure mutation layer, persists through the existing queue, updates React state, and shows feedback.

## Testing

- Unit tests cover list/get/add/update/move/delete, validation failures, fixed-number preservation, folder creation, and sequential mutations.
- Socket tests use a temporary directory to verify owner permissions, request size limits, malformed requests, renderer timeout, and clean shutdown.
- CLI tests use a temporary test socket to verify parsing, JSON output, application-closed errors, and exit codes.
- Integration source tests verify the Electron/preload/renderer bridge is connected without exposing generic IPC.
- The full existing test, lint, and desktop packaging suites must remain green.
- Final verification launches an isolated Clipbox profile, then exercises status, add, update, move, get, and delete through the installed `clipbox` command while confirming the renderer state changes.

## Non-Goals

- Editing while Clipbox is closed.
- Remote or LAN access.
- Cloud synchronization.
- A general plugin API.
- Secret listing, search, mutation, or bulk access.
- Spreadsheet compatibility changes.
- A multi-level revision history in this first version.
