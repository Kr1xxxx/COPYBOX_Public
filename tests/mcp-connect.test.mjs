import test from "node:test";
import assert from "node:assert/strict";
import { claudeAddCommand, codexAddCommand, codexConfigBlock, shellQuote, tomlString } from "../app/mcp-connect.ts";

test("the connect commands quote the program path for each system", () => {
  assert.equal(
    codexAddCommand("C:\\Users\\Krix\\AppData\\Local\\Copyboxx\\Copyboxx.exe", "win32"),
    "codex mcp add copyboxx -- \"C:\\Users\\Krix\\AppData\\Local\\Copyboxx\\Copyboxx.exe\" --mcp",
  );
  assert.equal(
    claudeAddCommand("/Applications/Copyboxx.app/Contents/MacOS/Copyboxx", "darwin"),
    "claude mcp add copyboxx -- '/Applications/Copyboxx.app/Contents/MacOS/Copyboxx' --mcp",
  );
  assert.equal(shellQuote("/Users/o'neil/Copyboxx", "darwin"), "'/Users/o'\\''neil/Copyboxx'");
});

test("the Codex config block is valid TOML for Windows and Mac paths", () => {
  assert.equal(
    codexConfigBlock("C:\\Program Files\\Copyboxx\\Copyboxx.exe"),
    "[mcp_servers.copyboxx]\ncommand = 'C:\\Program Files\\Copyboxx\\Copyboxx.exe'\nargs = [\"--mcp\"]\ntool_timeout_sec = 90",
  );
  assert.equal(tomlString("C:\\it's\\x"), "\"C:\\\\it's\\\\x\"");
});
