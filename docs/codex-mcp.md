# 让 Codex 等 AI 工具连接 Copyboxx（本机接口，D-058）

Copyboxx 自带一个本机接口（MCP）。Codex、Claude Code、Cursor 这类 AI 工具接上以后，可以帮你查话术、新增话术、
改话术、移动目录、把话术移进回收站。数据不会离开这台电脑。

## 怎么连接

1. 打开 Copyboxx → 设置 → AI → 「连接 Codex 等工具」。
2. 在「Codex」那一行点「复制」，粘贴到终端（Windows 用 PowerShell，Mac 用「终端」）里运行一次。
   - 用 Claude Code 的话，复制「Claude Code」那一行。
   - 用 Codex 桌面版或编辑器插件、不想开终端的话，把「Codex 配置文件」那几行加到用户文件夹里
     `.codex\config.toml`（Mac 是 `~/.codex/config.toml`）的最后，保存。
3. 重新打开 Codex，对它说「列出 Copyboxx 里的话术」试试。

其他支持 MCP 的工具：程序路径填设置里显示的那个，参数填 `--mcp`。

## 使用时要知道

- Copyboxx 要开着（收在托盘里也可以）。没开的话，AI 会说「Copyboxx 没有打开」。
- AI 删除话术只是移进回收站，可以在回收站里恢复。
- AI 要读秘密时，Copyboxx 会弹出「允许读取秘密吗？」，你点「允许」才给；45 秒没回答就当拒绝。账号页上锁时直接拒绝。
- 没有「一次导出全部秘密」的功能给 AI 用。
- 这台电脑上的其他程序也能用同样的方式连接，所以别在不信任的电脑上用。

## 给开发者

- 启动方式：`<Copyboxx 程序> --mcp`，标准输入输出上的 MCP（JSON-RPC，一行一条），代码在 `src-tauri/src/mcp.rs`。
- 工具：`copyboxx_status`、`list_snippets`、`get_snippet`、`add_snippet`、`update_snippet`、`move_snippet`、
  `delete_snippet`、`get_secret`、`verify_secret`。每次调用变成一条和 `clipbox` 命令行一样的命令。
- 通道：Mac/Linux 是 `~/Library/Application Support/Clipbox/automation.sock`；Windows 是命名管道
  `\\.\pipe\copyboxx-automation-<用户名>`（`src-tauri/src/automation.rs`）。
