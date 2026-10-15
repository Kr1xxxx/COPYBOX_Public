// What 设置 → AI → 「连接 Codex 等工具」 shows (D-060): the commands that register Copyboxx's MCP server
// (`<this program> --mcp`, src-tauri/src/mcp.rs) with Codex and Claude Code, and the lines for Codex's config file.

export const MCP_SERVER_NAME = "copyboxx";

// Shown in the browser preview, which has no program on disk; marked 示例 there.
export const EXAMPLE_PROGRAM_PATH: Record<"win32" | "darwin", string> = {
  win32: "C:\\Program Files\\Copyboxx\\Copyboxx.exe",
  darwin: "/Applications/Copyboxx.app/Contents/MacOS/Copyboxx",
};

/** The program path quoted for a command line: double quotes in Windows' terminals, single quotes elsewhere. */
export function shellQuote(path: string, platform: string) {
  if (platform === "win32") return `"${path.replace(/"/g, "")}"`;
  return `'${path.replace(/'/g, "'\\''")}'`;
}

export function codexAddCommand(path: string, platform: string) {
  return `codex mcp add ${MCP_SERVER_NAME} -- ${shellQuote(path, platform)} --mcp`;
}

export function claudeAddCommand(path: string, platform: string) {
  return `claude mcp add ${MCP_SERVER_NAME} -- ${shellQuote(path, platform)} --mcp`;
}

/** A TOML string: a literal string when it can be one (no escaping of Windows backslashes), else an escaped one. */
export function tomlString(value: string) {
  if (!/['\n\r]/.test(value)) return `'${value}'`;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
}

/** The block for ~/.codex/config.toml. A secret question waits up to 45 s for 允许, so the tool may wait 90 s. */
export function codexConfigBlock(path: string) {
  return [`[mcp_servers.${MCP_SERVER_NAME}]`, `command = ${tomlString(path)}`, `args = ["--mcp"]`, "tool_timeout_sec = 90"].join("\n");
}
