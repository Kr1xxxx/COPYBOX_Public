# 交接记录（每次结束工作前更新）

> 下一个接手的人只看这份文件就该知道：现在在哪、哪些没验证、下一步做什么。
> 更新方式：改“当前状态”和“待办”，在“工作日志”最上面加一条。

## 当前状态

- 仓库：https://github.com/Kr1xxxx/Clipbox
- 开发分支：`ui-redesign-h`，对应 PR #1（→ `main`），**等负责人在 Windows 实测后合并**。
- `npm run lint` 通过；`npm test` 169 项全部通过（2026-10-08）。
- 产品决定见 `docs/DECISIONS.md`。

## 已验证 / 未验证

| 项目 | 状态 |
| --- | --- |
| 界面、动画、设置、目录拖动、填变量、AI 设置流程 | 已在 Chromium 浏览器（Playwright）验证 |
| Electron 窗口尺寸、设置页、IPC 通路 | 已在 Linux 的 Electron 里验证 |
| Mac / Windows 外观差异（标题栏、秘密/备注、字体） | 只用模拟平台在浏览器里验证过 |
| Windows 真机：托盘、开机静默启动、NSIS 打包 | **未验证** |
| AI Key 系统加密保存（Windows DPAPI / Mac 钥匙串） | **未验证**（Linux 没有加密存储，只有模拟测试） |
| macOS 真机：红黄绿按钮对齐、arm64 打包、首次打开放行 | **未验证** |
| 大量数据（几百条以上）时的流畅度 | **未验证** |

## 待办

1. Windows 真机跑 `npm run desktop:pack:win`，安装后检查托盘呼出/收起、开机静默启动、AI“保存并测试”。
2. Mac（M 芯片）跑 `npm run desktop:pack`，检查标题栏和“秘密”板块。
3. 负责人同意后合并 PR #1。
4. 建议：把浏览器验证写成仓库里的自动化测试（目前的 Playwright 脚本没有提交进仓库）。
5. 如果托盘呼出不顺手：考虑“点任务栏/程序坞图标就显示窗口”（不能用快捷键，见 DECISIONS）。

## 浏览器验证怎么做

```bash
npm run build
PORT=3100 npm run start      # 浏览器打开 http://127.0.0.1:3100，窗口调到 680×620
```

- 用首次打开时的“导入话术表格”按钮（或 设置 → 数据 → 导入话术表格）导入 `docs/samples/clipbox-test-snippets.csv`（37 行，含 2 行错误、1 行重复，用来测导入提示）。
- 至少走一遍：切换话术（旧卡片要慢慢收起）、编辑、填变量（变量多时复制按钮要固定在底部）、设置 → 目录拖动、设置 → AI。
- 模拟 Mac / Windows：在页面加载前注入 `window.clipboxDesktop = { platform: "darwin" | "win32", ... }`，并给 `<html>` 加 `desktop-app platform-darwin` 或 `desktop-app platform-win32`。

## 工作日志

- 2026-10-08 — 方案 H 新界面完成并开 PR #1：切换/收起动画、设置里目录编辑和拖动、Windows 备注改纯文字、“小提示”、AI 自填接口（预设 + 获取模型）、Mac/Windows 平台修正、去掉所有快捷键、加交接文档和 CI。
