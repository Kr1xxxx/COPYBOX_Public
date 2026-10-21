# 让 Codex 等 AI 工具连接 Copyboxx（本机接口，D-060）

Copyboxx 自带一个本机接口（MCP）。Codex、Claude Code、Cursor 这类 AI 工具接上以后，可以帮你查话术、新增话术、
改话术、移动目录、把话术移进回收站，也能导入本机图片并整理图片目录。
接口在本机连接；AI 工具读取的话术或图片预览会交给该工具处理，是否发送到云端取决于工具及其配置。

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
- 话术目录工具：`list_snippet_folders`、`create_snippet_folder`、`rename_snippet_folder`。
- 批量工具：`get_snippets`、`update_snippets`。
- 图片工具：`list_images`、`import_images`、`get_image_thumbnail`、`update_images`、`list_image_folders`、
  `create_image_folder`、`rename_image_folder`。
- 通道：Mac/Linux 是 `~/Library/Application Support/Clipbox/automation.sock`；Windows 是命名管道
  `\\.\pipe\copyboxx-automation-<用户名>`（`src-tauri/src/automation.rs`）。

`update_snippet` 和批量版一样需要 `expectedUpdatedAt`（用 `get_snippet` 刚读到的 `updatedAt`）：期间话术被改过就返回
`CONFLICT`，不会覆盖新内容。它按一项的 `update_snippets` 执行，结果在 `items` 里。

## 批量整理话术

先用 `list_snippet_folders` 查询可用目录，再用 `get_snippets` 读取 1–100 个不同编号的完整内容。
`update_snippets` 接收 `updates` 数组，每项包含 `number` 和刚读到的 `expectedUpdatedAt`，再加要修改的
`title`、`content`、`summary`、`folder` 或 `chineseText`。没有提供的字段保持原样。

```json
{"updates":[{"number":"CB-0001","expectedUpdatedAt":1234567890000,"content":"Example reply"}]}
```

整个话术批次先校验再保存一次；任何编号不存在、版本过期或内容不合法，整批都不写入。遇到 `CONFLICT`
应重新读取并核对变更，不能盲目覆盖。

`create_snippet_folder` 用 `name` 创建自定义目录；首尾空格会去除，名称需要 1–30 个字符。
同名目录已经存在时返回 `created: false`，不重复创建。`rename_snippet_folder` 用 `from`、`to` 改名；
标准话术目录不能改名，目标不能与其他目录重名。改名会保留目录内话术的归类、目录颜色、简称和本机置顶。
新增、移动、批量修改话术均可使用已存在的自定义目录，不会隐式创建拼错的目录。

```json
{"name":"客户回访"}
```

```json
{"from":"客户回访","to":"售后回访"}
```

配置了工具白名单的客户端需要加入 `create_snippet_folder`、`rename_snippet_folder`，再重新连接。
这些能力需要包含本次改动的应用版本；仅更新客户端配置不会给旧应用增加工具。

## 导入和整理图片

1. `list_image_folders` 查询目录，必要时 `create_image_folder` 创建目录。
2. `import_images` 传入 `files` 数组，每项为本机绝对路径 `path`，可选 `title` 和已有目录 `folder`。
   不接受 URL 或调用方提供的图片字节。支持 PNG、JPEG、WebP、GIF；每次 1–10 张，单张不超过 10 MiB，
   总计不超过 20 MiB。拒绝符号链接和非普通文件；应用还会实际解码，最多 4000 万像素。只在本机处理，不调用压缩服务。
3. `list_images` 返回有效图片的元信息与 `updatedAt`，支持 `query`（标题）、`folder`、`offset`、`limit`
   （默认 50，上限 100）；不返回原图。`folder: ""` 查询未分类图片，省略则查询全部。
4. `update_images` 接收 1–100 项 `updates`，每项带 `id`、`expectedUpdatedAt`，以及 `title` 或 `folder`。
   `folder: null` 移至未分类。`rename_image_folder` 用 `from`、`to` 重命名目录。
5. `get_image_thumbnail` 用 `id` 获取最长边 320 像素、最多 512 KiB 的预览，以 MCP image block 返回。
   预览失败会报错，不会退回原图。

```json
{"files":[{"path":"/absolute/path/example.png","title":"Example","folder":"Products"}]}
```

图片操作按项报告结果：导入为 `imported`、`duplicate`、`error`；更新为 `updated`、`error`。
检查每一项的 `status`，不能只看工具是否返回成功。文件读取/路径/大小检查在导入前完成；单个文件的读取、解码或
保存失败只影响该项，已成功的图片保留。请求结构不合法（例如超出 10 项或包含未知字段）则整批拒绝。
重复图片按有效图片的实际字节识别并返回原记录，不改原标题或目录。
每项更新在图片的写入队列里核对版本，并一次保存标题和目录：要么都改好，要么都不改。核对后、保存前界面改过同一张图片，
也会返回 `CONFLICT`，不会覆盖。重新列出图片后再重试。图片任务不会阻塞话术保存；同一时间的其他图片请求
会返回 `IMAGE_BUSY`，完成后再重试。导入等待上限为 60 秒；超时也应先查询结果，不要假定操作没有执行。

没有新增图片删除工具，没有新增账号读取能力，原有秘密授权流程保持不变。
