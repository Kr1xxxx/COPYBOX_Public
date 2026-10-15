# Local MCP server for Codex and other AI tools

- Date: 2026-10-15 · Thread/agent: 功能 · 本機接口讓 Codex 連接
- What changed: `Copyboxx --mcp` is an MCP server over stdio (src-tauri/src/mcp.rs) with 9 tools (status, 话术 list/get/add/update/move/delete, get_secret and verify_secret with an optional `field` for API entries with several secrets) that forward to the running app. Windows now has a local door too: a per-user named pipe next to the existing macOS/Linux socket (automation.rs); the tool's name travels as `_client` and reaches the page as `client`. 设置 → AI has a new card 「连接 Codex 等工具」 with copyable `codex mcp add` / `claude mcp add` commands and the config.toml lines (app/mcp-connect.ts, app/mcp-connect-ui.tsx). D-060, how-to in docs/codex-mcp.md.
- User-visible change (plain Chinese, for the preview changelog): 设置 → AI 新增「连接 Codex 等工具」：复制一行命令，Codex、Claude Code 等就能查看和整理话术，读秘密前仍会先问你
- Not done / risks: Windows pipe only checked by cargo test on the Windows CI runner, not on a real PC. The `client` name is what the tool claims, not proof. No `secret export` tool on purpose. The `clipbox` command line still does not run on Windows.
- Next step: Krix tries the Codex command on his PC; the always-allow thread (D-059) can show and use `client`.
