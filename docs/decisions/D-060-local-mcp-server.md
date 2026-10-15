### D-060 A local MCP server so Codex and other AI tools can reach Copyboxx (2026-10-15; D-058 and D-059 went to parallel PRs)
- Context (owner, 2026-10-15): 「能不能加一个本机接口，codex 什么的可以连接上？」. Until now the only local door was the
  `clipbox` command line over a unix socket, macOS/Linux only; Windows, where the owner and staff work, had none.
- Decision: the app's own program doubles as an MCP server. `Copyboxx --mcp` (src-tauri/src/mcp.rs) speaks the Model
  Context Protocol over stdin/stdout, opens no window and turns each tool call into one command on the running app's
  local door. MCP over stdio is what Codex, Claude Code, Cursor and others use for local tools, needs no Node and no
  open network port, and the tool starts and stops it itself.
  - The local door: macOS/Linux keep the private unix socket (0600 in a 0700 folder). Windows gets a named pipe
    `\\.\pipe\copyboxx-automation-<user>`: refuses connections from other computers, must be the first instance of
    that name (another program cannot take it first), and its default security only lets this user, administrators and
    the system send commands. No new dependency (tokio's named pipes).
  - Tools: status, list / get / add / update / move / delete (delete = 回收站) of 话术, and get_secret / verify_secret.
    Every 秘密 read goes through the same 「允许读取秘密吗？」 question as the command line. There is deliberately no tool
    that exports all secrets at once (the command line's `secret export` stays command-line only).
  - The tool's own name (MCP `clientInfo`, e.g. "Codex") travels as `_client` in the command; the shell takes it out and
    hands it to the page as `client` next to the command. It is what the program says about itself, not proof: any
    program on this computer can claim to be Codex, so an always-allow (D-059) must not trust it. D-059 finds the caller
    from the connecting process; through MCP that process is Copyboxx itself (`--mcp`), so it has to look past it to
    its parent (Codex). Until it does, an always-allow given to an MCP call covers every tool that uses `--mcp`.
  - 设置 → AI → 「连接 Codex 等工具」 shows the `codex mcp add …` / `claude mcp add …` commands and the
    `~/.codex/config.toml` lines with this computer's program path, each with 复制. How-to: docs/codex-mcp.md.
- Consequences: AI tools on this computer can read and change 话术 while Copyboxx is open; secrets still need a click
  in the app. Staff who never register the server are not affected. Windows behaviour is checked by `cargo test` on
  the Windows CI runner, not yet on a real PC.
- Status: proposed in the PR for this decision; high risk (a new path to stored data), merges only on the owner's 合并.
