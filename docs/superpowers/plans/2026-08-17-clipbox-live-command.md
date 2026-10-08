# Clipbox Live Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let other local Codex tasks directly query and modify encrypted Clipbox snippets through a `clipbox` command while the desktop app is open.

**Architecture:** A user-only Unix domain socket in the Electron main process accepts bounded JSON commands and forwards them through a narrow preload IPC bridge to the active renderer. The renderer applies commands with a pure mutation module and returns success only after the existing encrypted persistence queue completes; a CLI installed at `~/.local/bin/clipbox` provides human and JSON output.

**Tech Stack:** TypeScript, React 19, Electron 37, Node.js `net`, Web Crypto, Node test runner, existing localStorage AES-GCM vault.

## Global Constraints

- Operate only while Clipbox is open; never auto-launch the app from the CLI.
- Expose snippets only; never expose secret entries, device keys, encrypted envelopes, arbitrary IPC, or arbitrary filesystem access.
- Address entries by fixed `CB-xxxx` number and preserve that number across updates and moves.
- Serialize external mutations and report success only after encrypted persistence completes.
- Add no third-party dependency.
- Install the launcher at `~/.local/bin/clipbox`, which is already in the user's PATH.
- Bind no TCP port; use an owner-only Unix socket under Clipbox application support.
- Preserve all existing UI state, imported metadata, ordering, pin state, and folders unless the command explicitly changes a supported field.

---

### Task 1: Pure Snippet Automation Commands

**Files:**
- Create: `app/clipbox-automation.ts`
- Create: `tests/clipbox-automation.test.mjs`
- Modify: `app/clipbox-core.ts`

**Interfaces:**
- Consumes: `VaultData`, `SecretItem`, `SnippetMeta`, `normalizeFolderName`, and `synchronizeVaultData` from `app/clipbox-core.ts`.
- Produces: `parseAutomationCommand(value: unknown): AutomationCommand`, `applySnippetAutomationCommand(vault, command, runtime): AutomationOutcome`, and exported request/result types.
- `AutomationRuntime` is `{ createId: () => string; now: () => number }`.
- `AutomationOutcome` is `{ data: VaultData; changed: boolean; result: AutomationResult }`.

- [ ] **Step 1: Write failing tests for read commands and validation**

```js
test("lists snippets without exposing secrets", () => {
  const outcome = automation.applySnippetAutomationCommand(vaultWithSnippetAndSecret(), { action: "list" }, runtime);
  assert.deepEqual(outcome.result.items.map((item) => item.number), ["CB-0001"]);
  assert.equal(JSON.stringify(outcome.result).includes("private secret"), false);
  assert.equal(outcome.changed, false);
});

test("rejects malformed commands and unknown fields", () => {
  assert.throws(() => automation.parseAutomationCommand({ action: "update", number: "CB-0001", arbitrary: true }), /Unsupported field/);
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run: `node --test tests/clipbox-automation.test.mjs`

Expected: FAIL because `app/clipbox-automation.ts` does not exist.

- [ ] **Step 3: Implement command types, strict parsing, and read-only list/get/status results**

```ts
export type AutomationCommand =
  | { action: "status" }
  | { action: "list"; folder?: string; query?: string }
  | { action: "get"; number: string }
  | { action: "add"; title: string; content: string; summary?: string; folder?: string; chineseText?: string }
  | { action: "update"; number: string; title?: string; content?: string; summary?: string; folder?: string; chineseText?: string }
  | { action: "move"; number: string; folder: string }
  | { action: "delete"; number: string; confirmed: true };

export function parseAutomationCommand(value: unknown): AutomationCommand;
export function applySnippetAutomationCommand(
  vault: VaultData,
  command: AutomationCommand,
  runtime: AutomationRuntime,
): AutomationOutcome;
```

Normalize numbers to uppercase and require `/^CB-\d{4,}$/`. List output contains number, title, summary, folder, pinned, and updatedAt. Get output additionally contains English content, Chinese content, and a copy of structured snippet metadata. Neither output contains secret-kind entries.

- [ ] **Step 4: Add failing mutation tests**

Cover all of these exact behaviors:

```js
test("adds the next permanently numbered snippet and creates its folder", () => {
  const outcome = apply(vault, { action: "add", title: "New", content: "Hello", folder: " 开发 " });
  assert.equal(outcome.result.item.number, "CB-0002");
  assert.equal(outcome.data.items[0].snippetNumber, "CB-0002");
  assert.deepEqual(outcome.data.folders.snippet, ["开发"]);
});

test("partially updates content without changing fixed fields", () => {
  const before = vault.items[0];
  const outcome = apply(vault, { action: "update", number: "cb-0001", content: "Updated" });
  const after = outcome.data.items.find((item) => item.snippetNumber === "CB-0001");
  assert.equal(after.secret, "Updated");
  assert.equal(after.id, before.id);
  assert.equal(after.createdAt, before.createdAt);
  assert.equal(after.pinned, before.pinned);
  assert.equal(after.snippetNumber, "CB-0001");
});
```

Also test move with automatic folder creation, Chinese-text metadata preservation, confirmed delete, unconfirmed delete rejection, empty title/content rejection, unknown number rejection, secret-target rejection, and sequential outcomes where command two consumes command one's `data`.

- [ ] **Step 5: Implement minimal mutation logic**

Use `synchronizeVaultData` after every mutation. For add, create a snippet with `kind: "snippet"`, `snippetNumber` left undefined, `color: "#ffcfa8"`, timestamps from `runtime.now()`, and ID from `runtime.createId()`; synchronization assigns the next permanent number. For update/move, clone only the target and fields named by the command. For Chinese text, clone existing `snippetMeta` or create an empty structured metadata object before setting `chineseText`. For delete, remove exactly one matched snippet only when `confirmed === true`.

- [ ] **Step 6: Run focused tests**

Run: `node --test tests/clipbox-automation.test.mjs`

Expected: all automation tests PASS.

- [ ] **Step 7: Commit the pure command layer**

```bash
git add app/clipbox-automation.ts app/clipbox-core.ts tests/clipbox-automation.test.mjs
git commit -m "feat: add validated snippet automation commands"
```

---

### Task 2: Owner-Only Unix Socket Server

**Files:**
- Create: `desktop/automation-server.cjs`
- Create: `tests/automation-server.test.mjs`

**Interfaces:**
- Consumes: Node `net`, `fs`, and `path` only.
- Produces: `createAutomationServer({ socketPath, forward, timeoutMs?, maxBytes? })` returning `{ start(): Promise<void>; close(): Promise<void> }`.
- `forward(command)` returns a promise resolving to the renderer's JSON-safe response.

- [ ] **Step 1: Write failing socket lifecycle tests**

Use `fs.mkdtempSync(path.join(os.tmpdir(), "clipbox-automation-"))` and assert:

```js
const server = createAutomationServer({
  socketPath,
  forward: async (command) => ({ ok: true, action: command.action }),
});
await server.start();
assert.equal(fs.statSync(socketPath).mode & 0o777, 0o600);
assert.deepEqual(await sendSocketRequest(socketPath, { action: "status" }), { ok: true, action: "status" });
await server.close();
assert.equal(fs.existsSync(socketPath), false);
```

Add tests for malformed JSON, non-object payloads, payloads over 1 MiB, one response per connection, forward rejection, renderer timeout, and stale socket cleanup. Tests must close servers and remove temporary directories in `finally`.

- [ ] **Step 2: Run the focused test and verify the red state**

Run: `node --test tests/automation-server.test.mjs`

Expected: FAIL because `desktop/automation-server.cjs` does not exist.

- [ ] **Step 3: Implement the bounded newline JSON server**

Create the parent directory with mode `0700`, verify/chmod it to `0700`, and listen on the Unix socket. Accumulate at most `maxBytes` bytes until newline or connection end, parse one JSON object, call `forward`, and return one JSON line. Use `{ ok: false, error: { code, message } }` for protocol errors. Set the socket file mode to `0600` after listening.

Before unlinking an existing path, attempt a short connection. If a listener accepts, fail startup with `EADDRINUSE`; if connection returns `ECONNREFUSED` or `ENOENT`, remove the stale socket and continue.

- [ ] **Step 4: Run focused socket tests**

Run: `node --test tests/automation-server.test.mjs`

Expected: all socket server tests PASS.

- [ ] **Step 5: Commit the socket server**

```bash
git add desktop/automation-server.cjs tests/automation-server.test.mjs
git commit -m "feat: add local snippet automation socket"
```

---

### Task 3: `clipbox` CLI and Launcher Installation

**Files:**
- Create: `desktop/clipbox-cli.cjs`
- Create: `tests/clipbox-cli.test.mjs`
- Modify: `desktop/automation-server.cjs`

**Interfaces:**
- Consumes: the newline JSON socket protocol from Task 2.
- Produces: executable `desktop/clipbox-cli.cjs`, `parseCliArguments(argv)`, `commandToRequest(parsed, stdinValue)`, and `installAutomationCli({ sourcePath, targetPath })`.
- Uses `CLIPBOX_AUTOMATION_SOCKET_PATH` for test overrides; otherwise resolves `~/Library/Application Support/Clipbox/automation.sock`.

- [ ] **Step 1: Write failing parser and client tests**

Test exact translations:

```js
assert.deepEqual(parseCliArguments(["get", "cb-0003", "--json"]), {
  command: "get", number: "CB-0003", json: true,
});
assert.deepEqual(commandToRequest(parseCliArguments([
  "update", "CB-0003", "--content", "New copy", "--folder", "跟进",
])), {
  action: "update", number: "CB-0003", content: "New copy", folder: "跟进",
});
```

Spawn the CLI against a temporary fake socket and assert human output, `--json` output, nonzero exit on `{ ok:false }`, `--confirm` requirement for delete, standard-input JSON merging, unknown-option rejection, and the clear app-closed message `Clipbox 未打开，请先打开应用。`.

- [ ] **Step 2: Run the focused test and verify the red state**

Run: `node --test tests/clipbox-cli.test.mjs`

Expected: FAIL because `desktop/clipbox-cli.cjs` does not exist.

- [ ] **Step 3: Implement argument parsing and socket request behavior**

The executable begins with `#!/usr/bin/env node`. Support `status`, `list`, `get`, `add`, `update`, `move`, and `delete`. Supported options are `--title`, `--content`, `--summary`, `--folder`, `--chinese`, `--query`, `--json`, `--stdin`, and `--confirm`. `--stdin` reads one JSON object and merges it only with allowed command fields; explicit command-line options win.

Human output uses one line per snippet for list and labeled lines for get/mutations. JSON output prints the exact server response. Never print socket paths, device keys, or stack traces for expected errors.

- [ ] **Step 4: Implement safe launcher installation**

Add this exact interface to `desktop/automation-server.cjs`:

```js
function installAutomationCli({ sourcePath, targetPath }) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o755 });
  const source = fs.readFileSync(sourcePath);
  const current = fs.existsSync(targetPath) ? fs.readFileSync(targetPath) : null;
  if (!current || !source.equals(current)) fs.writeFileSync(targetPath, source, { mode: 0o755 });
  fs.chmodSync(targetPath, 0o755);
}
```

Test fresh install, idempotent update, replacement of an older launcher, and executable mode.

- [ ] **Step 5: Run focused CLI tests**

Run: `node --test tests/clipbox-cli.test.mjs tests/automation-server.test.mjs`

Expected: all CLI and socket tests PASS.

- [ ] **Step 6: Commit the CLI**

```bash
git add desktop/clipbox-cli.cjs desktop/automation-server.cjs tests/clipbox-cli.test.mjs tests/automation-server.test.mjs
git commit -m "feat: add clipbox command line client"
```

---

### Task 4: Electron, Preload, Renderer, and Encrypted Persistence Bridge

**Files:**
- Modify: `desktop/main.cjs`
- Modify: `desktop/preload.cjs`
- Modify: `app/page.tsx`
- Create: `tests/automation-bridge.test.mjs`

**Interfaces:**
- Consumes: `createAutomationServer`, `installAutomationCli`, and `applySnippetAutomationCommand` from Tasks 1-3.
- Produces renderer bridge methods `onAutomationCommand(callback)` and `respondAutomationCommand(requestId, response)` on `window.clipboxDesktop`.
- Main-process IPC channels are exactly `clipbox:automation-command` and `clipbox:automation-response`.

- [ ] **Step 1: Write failing bridge source tests**

Assert that:

```js
assert.match(mainSource, /createAutomationServer/);
assert.match(mainSource, /clipbox:automation-response/);
assert.match(preloadSource, /onAutomationCommand/);
assert.match(preloadSource, /respondAutomationCommand/);
assert.doesNotMatch(preloadSource, /send:\s*ipcRenderer\.send/);
assert.match(pageSource, /applySnippetAutomationCommand/);
assert.match(pageSource, /await persistQueueRef\.current/);
```

Also assert `desktop/clipbox-cli.cjs` remains included by the existing `desktop/**/*` package rule.

- [ ] **Step 2: Run bridge tests and verify the red state**

Run: `node --test tests/automation-bridge.test.mjs`

Expected: FAIL because no bridge is wired.

- [ ] **Step 3: Start and stop the server in Electron main**

Resolve the socket path from `process.env.CLIPBOX_AUTOMATION_SOCKET_PATH` or `path.join(app.getPath("userData"), "automation.sock")`. Install the CLI to `path.join(app.getPath("home"), ".local", "bin", "clipbox")` during `whenReady`. Start the automation server only after the renderer has finished loading and registered its handler. Close it in `before-quit` and before application relaunch.

Maintain a `Map` of pending renderer requests. Each forwarded command gets `crypto.randomUUID()`, is sent to the main window, and resolves only when the matching response arrives from that same window. Reject if there is no ready window or after 10 seconds.

- [ ] **Step 4: Expose only narrow preload functions**

```js
onAutomationCommand: (callback) => {
  const listener = (_event, request) => callback(request);
  ipcRenderer.on("clipbox:automation-command", listener);
  return () => ipcRenderer.removeListener("clipbox:automation-command", listener);
},
respondAutomationCommand: (requestId, response) => {
  ipcRenderer.send("clipbox:automation-response", { requestId, response });
},
```

Update the TypeScript `Window` declaration with exact typed methods; do not expose raw `ipcRenderer`.

- [ ] **Step 5: Register a serialized renderer command handler**

Add an `automationQueueRef` initialized to `Promise.resolve()`. Register `onAutomationCommand` only after the vault has opened and `deviceKey` is available. For each request:

1. Append work to `automationQueueRef`.
2. Parse and apply the command against `{ items: itemsRef.current, folders: foldersRef.current, nextSnippetNumber: nextSnippetNumberRef.current }`.
3. For read commands, return the result immediately.
4. For changes, call `persist(outcome.data.items, outcome.data.folders)` and await its returned promise.
5. Return `{ ok: true, ...outcome.result }` only after persistence resolves.
6. Show `外部任务已更新 <CB-number>` or `外部任务已新增 <CB-number>` without changing the active folder, query, or product filter.
7. On failure, return `{ ok:false, error:{ code, message } }` and show a concise error toast.

Use refs inside the listener so the effect does not re-register for every list change. Clean up the preload listener on unmount.

- [ ] **Step 6: Run bridge and all focused tests**

Run: `node --test tests/automation-bridge.test.mjs tests/clipbox-automation.test.mjs tests/automation-server.test.mjs tests/clipbox-cli.test.mjs`

Expected: all focused tests PASS.

- [ ] **Step 7: Commit the live bridge**

```bash
git add desktop/main.cjs desktop/preload.cjs app/page.tsx tests/automation-bridge.test.mjs
git commit -m "feat: connect live commands to encrypted vault"
```

---

### Task 5: Version, User Guidance, Packaging, and End-to-End Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-17-clipbox-live-command-design.md` only if implementation revealed a factual mismatch.

**Interfaces:**
- Consumes: the complete installed `clipbox` command and packaged Electron app.
- Produces: Clipbox `0.2.13`, user documentation, and verified packaged behavior.

- [ ] **Step 1: Bump the application version**

Change both root version fields in `package-lock.json` and the version in `package.json` from `0.2.12` to `0.2.13`.

- [ ] **Step 2: Document commands for other tasks**

Add a README section with these examples:

```bash
clipbox status
clipbox list --folder 开发 --json
clipbox get CB-0003 --json
clipbox update CB-0003 --content "Updated English message"
clipbox move CB-0003 --folder 跟进
clipbox add --title "新客户询盘" --content "Thanks for reaching out." --folder 开发
clipbox delete CB-0003 --confirm
```

State that Clipbox must be open, commands affect snippets only, writes are encrypted before success is returned, and `--json` is recommended for Codex tasks.

- [ ] **Step 3: Run complete automated verification**

Run: `npm test && npm run lint && git diff --check`

Expected: all tests PASS, lint exits 0, and diff check produces no output.

- [ ] **Step 4: Build the desktop package**

Run: `npm run desktop:pack`

Expected: `release/mac-arm64/Clipbox.app` is produced and packaging exits 0.

- [ ] **Step 5: Run an isolated real-app command sequence**

Quit the normal Clipbox instance. Create a temporary user-data directory with `mktemp -d` and a temporary socket path inside it. Launch the packaged binary with both `CLIPBOX_AUTOMATION_SOCKET_PATH=<temp>/automation.sock` and `--user-data-dir=<temp>/profile`. Wait for `clipbox status --json` to succeed with the same socket override, then run:

```bash
clipbox add --title "Automation Test" --content "Initial" --folder "开发" --json
clipbox update CB-0001 --content "Updated" --summary "自动测试" --json
clipbox move CB-0001 --folder "跟进" --json
clipbox get CB-0001 --json
clipbox delete CB-0001 --confirm --json
clipbox list --json
```

Assert the fixed number remains `CB-0001`, get returns `Updated` in folder `跟进`, and the final list is empty. Quit the isolated app, move the temporary profile to Trash or delete only that exact validated temporary directory, and reopen `/Applications/Clipbox.app` normally.

- [ ] **Step 6: Install the verified application with recovery backup**

Confirm the installed version, quit Clipbox, move `/Applications/Clipbox.app` to `/Applications/Clipbox-备份-v0.2.12.app`, copy the packaged `Clipbox.app` into `/Applications`, and open it normally. Verify `defaults read /Applications/Clipbox.app/Contents/Info CFBundleShortVersionString` prints `0.2.13`, `clipbox status --json` succeeds, and the normal process has no remote-debugging argument.

- [ ] **Step 7: Commit release metadata and docs**

```bash
git add package.json package-lock.json README.md docs/superpowers/specs/2026-08-17-clipbox-live-command-design.md
git commit -m "docs: document live snippet commands"
```

- [ ] **Step 8: Final working-tree verification**

Run: `git status --short && npm test`

Expected: status is empty and all tests PASS on the exact committed tree.
