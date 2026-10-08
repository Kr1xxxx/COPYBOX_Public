# Clipbox 开发须知

给接手的 AI agent 和开发人员。Claude、Codex、Cursor、Copilot 等工具都会读这份文件。
详细内容放在 `docs/`，这里只放每次都要知道的。

## 项目

本地加密的复制盒：保存“话术”（客服常用回复）和第二个板块（Windows 叫“备注”，macOS 叫“秘密”），点一下就复制。
**Windows 优先**；macOS 只出 Apple 芯片（arm64）版。界面全中文。数据只在本机，没有服务器和账号。

技术栈：Electron 37（`desktop/`，CommonJS）+ React 19 + vinext 1.0 beta（类 Next.js，跑在 Vite 上，`app/`）+ 手写 CSS（`app/globals.css`）+ TypeScript，Node ≥ 22.18。

## 开始工作前（每次都做）

1. 读 `docs/HANDOFF.md`（现状、任务板）和 `git log --oneline -20`。
2. 读 `docs/DECISIONS.md`，确认要做的事不和已定决定冲突。
3. 跑 `npm test` 和 `npm run test:e2e`，先确认起点是绿的；不绿就先修，或在 HANDOFF 里记下来。
4. 在任务板上把要做的那一项标成“进行中”。一次只做一项，做完再拿下一项。

## 命令

```bash
npm install
npm run dev              # 浏览器开发 http://localhost:3000
npm run lint             # 必须通过
npm test                 # build + 单元/源码测试 tests/*.test.mjs
npm run test:e2e         # build + 浏览器端到端测试 tests/e2e/（Playwright，窗口 680×620）
npm run desktop:dev      # 本机跑桌面版
npm run desktop:pack:win # Windows 安装包，在 Windows 上跑 → release/
npm run desktop:pack     # macOS arm64 .app，在 Mac 上跑 → release/mac-arm64/
```

## 结构

| 位置 | 内容 |
| --- | --- |
| `app/page.tsx` | 主界面（列表、编辑、填变量、设置、迷你窗口），约 2500 行，先搜索再改 |
| `app/clipbox-core.ts` | 纯函数（目录、搜索、批量、`tidyText`），新逻辑优先放这里并写单元测试 |
| `app/ai-config.ts` | 用户自填 AI 接口：预设、校验、请求/响应解析 |
| `app/globals.css` | 全部样式；平台差异用 `.platform-darwin` / `.desktop-app:not(.platform-darwin)` |
| `desktop/main.cjs` | 主进程：窗口、托盘、开机启动、IPC |
| `desktop/preload.cjs` | `window.clipboxDesktop` 桥，页面只能通过它碰系统 |
| `desktop/ai.cjs` | AI Key 用系统加密（safeStorage）保存 |
| `tests/*.test.mjs` | node:test；不少是对源码的正则断言 |
| `tests/e2e/` | 浏览器端到端测试，`helpers.mjs` 里有导入示例数据、模拟 Windows/Mac |
| `docs/features.json` | 功能验证清单（浏览器 / Windows / Mac 是否真的验证过） |
| `docs/samples/` | 模拟话术表格；测试只用这里的数据 |
| `docs/archive/` | 以前的计划文档，**已过时，不要照着做** |

## 平台差异

- `window.clipboxDesktop.platform === "darwin"` → “秘密”（隐藏内容、复制引用、分段）；其他平台 → “备注”，纯文字（`PLAIN_NOTES`）。
- Mac：隐藏标题栏 + 红黄绿按钮；Windows：系统原生边框、托盘、`--hidden` 静默开机启动。
- 命令行自动化只在 macOS/Linux 启动。

## 边界

**一定要做**
- 提交前 `npm run lint`、`npm test` 通过；改了界面再跑 `npm run test:e2e`，并在浏览器里亲眼看一遍。
- 新功能配测试；能做端到端的写进 `tests/e2e/`。
- 用户看得到的文字一律中文、简短、不用技术词。
- 在 `docs/features.json` 里只把**真的走过一遍**的平台改成 `true`。

**先问负责人**
- 推翻或修改 `docs/DECISIONS.md` 里的任何决定。
- 加新依赖、改加密格式或存储键名（`clipbox.vault.v1` 等）—— 改错会让用户数据打不开，必须带迁移和测试。
- 合并到 `main`、发布新版本。

**绝不**
- 直接推 `main`，或自己合并 PR —— 合并由负责人决定。
- 提交真实客户数据、API Key、`.env` —— 测试数据用 `docs/samples/`。
- 为了让测试变绿去删测试或放宽断言 —— 先弄清楚是代码错还是测试过时，测试过时要在 PR 里说明。
- 改 `saveItem`、`submit`、`openVault` 等函数名 —— `tests/helpers/page-harness.mjs` 按名字提取它们。
- 加任何快捷键或“自动清除剪贴板” —— 负责人已明确不要。

## 结束工作时

1. 更新 `docs/HANDOFF.md`：当前状态、任务板，在 `docs/handoff-log.md` 最上面加一条。
2. 新决定写进 `docs/DECISIONS.md`；验证过的功能更新 `docs/features.json`。
3. 小步提交、推分支、开 PR（按模板填）。CI 会检查：改了 `app/`、`desktop/` 却没改 `docs/HANDOFF.md` 会失败。
4. 用中文四段汇报：**做了什么 / 没做好的地方 / 需要你做的 / 建议下一步**。能做的就做完，不留成注意事项。

这份文件保持在 150 行以内。只有当 agent 反复犯同一个错时才加规则；过时的内容直接删。
