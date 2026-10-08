# Clipbox 开发须知（给任何 AI agent 和新开发人员）

接手前请按顺序读：本文件 → `docs/HANDOFF.md`（现状和待办）→ `docs/DECISIONS.md`（已经定下的产品决定，不要推翻）。
每次结束工作前，更新 `docs/HANDOFF.md`，下一个人只看这份文件就能接着做。

## 项目是什么

Clipbox 是本地加密的复制盒：保存“话术”（客服常用回复）和第二个板块（Windows 叫“备注”，macOS 叫“秘密”），点一下就复制。
**Windows 优先**，macOS 只出 Apple 芯片（arm64）版本。界面全中文。数据只在本机，没有服务器、没有账号。

## 技术栈

- Electron 37（`desktop/`，CommonJS）+ React 19 + vinext（类 Next.js，跑在 Vite 上，`app/`）
- 手写 CSS：`app/globals.css`（Tailwind 引入了但没用，不要改成 Tailwind）
- TypeScript；Node ≥ 22.18（测试直接 `import` `.ts` 文件）
- 数据：渲染进程 localStorage 里的加密保险库（PBKDF2 310k + AES-GCM，设备密钥）

## 常用命令

```bash
npm install
npm run dev              # 浏览器开发，http://localhost:3000
npm run lint             # 必须通过
npm test                 # 先 build 再跑 tests/*.test.mjs，必须全部通过
npm run desktop:dev      # 本机跑桌面版
npm run desktop:pack:win # Windows 安装包（在 Windows 上跑）→ release/
npm run desktop:pack     # macOS arm64 .app（在 Mac 上跑）→ release/mac-arm64/
```

## 代码地图

| 位置 | 内容 |
| --- | --- |
| `app/page.tsx` | 主界面（列表、编辑、填变量、设置、迷你窗口），文件很大，改之前先搜索 |
| `app/clipbox-core.ts` | 纯函数：目录、搜索、批量、文本整理 `tidyText` 等，优先把逻辑放这里并写测试 |
| `app/ai-config.ts` | 用户自填的 AI 接口：预设、校验、请求/响应解析 |
| `app/globals.css` | 全部样式；平台差异用 `html.platform-darwin` / `.desktop-app:not(.platform-darwin)` |
| `desktop/main.cjs` | Electron 主进程：窗口、托盘、开机启动、IPC |
| `desktop/preload.cjs` | `window.clipboxDesktop` 桥（页面只能通过它访问系统） |
| `desktop/ai.cjs` | AI 密钥用系统加密（safeStorage）保存，只发往保存时的服务器 |
| `tests/` | node:test 测试；很多是对源码的正则断言，改文案/结构时要同步改测试 |
| `docs/samples/` | 37 行模拟话术表格，用于测试导入 |

## 平台差异（只在这几处分叉）

- `window.clipboxDesktop.platform === "darwin"` → 第二板块叫“秘密”，有隐藏内容/复制引用/分段；否则叫“备注”，是纯文字（`PLAIN_NOTES`）。
- 窗口：Mac 用隐藏标题栏 + 红黄绿按钮；Windows 用系统原生边框、托盘、`--hidden` 静默开机启动。
- 命令行自动化只在 macOS/Linux 启动，Windows 不启动。

## 规则

1. **不要推翻 `docs/DECISIONS.md` 里的决定**（例如：不加任何快捷键、不加自动清除剪贴板）。想改先问负责人。
2. 不直接推 `main`。在分支上开发，开 PR；**合并到 main 必须经负责人同意**。
3. 提交前 `npm run lint` 和 `npm test` 全部通过；新功能要有测试。
4. 改界面后要在浏览器里实际看一遍（窗口 680×620），说明里写清楚验证了什么、没验证什么。
5. 不提交任何真实客户数据、API Key、`.env`；测试数据只用 `docs/samples/`。
6. 不改加密格式和存储键名（`clipbox.vault.v1` 等），否则用户数据打不开。必须改时要写迁移和测试。
7. `tests/helpers/page-harness.mjs` 会按函数名从 `page.tsx` 里提取 `saveItem`、`submit`、`openVault` 等函数，不要随意改这些名字。
8. 对用户可见的文字一律中文，简短，不要出现英文术语或技术名词。

## 汇报格式（负责人要求）

每完成一项工作，用中文按四段汇报：**做了什么 / 没做好的地方 / 需要你做的 / 建议下一步**。
能做的就直接做完，不要把能做的事留成“注意事项”。
