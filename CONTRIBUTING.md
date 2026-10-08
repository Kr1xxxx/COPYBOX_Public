# 参与开发

适用于公司内的开发人员和 AI agent。先读 `AGENTS.md`。

## 开始一项工作

1. `git checkout main && git pull`，从最新的 `main` 拉新分支：`feature/简短英文名` 或 `fix/简短英文名`。
2. 读 `docs/HANDOFF.md` 和 `docs/DECISIONS.md`，确认要做的事不和已定的决定冲突。
3. `npm install`，跑一次 `npm test` 和 `npm run test:e2e`，确认起点是绿的。
4. 在 `docs/HANDOFF.md` 任务板上把这一项标成“进行中”。一个分支、一个 PR 只做一件事。

## 提交

- 一个提交只做一件事，提交信息用一句英文或中文说清楚改了什么。
- 提交前：`npm run lint`、`npm test` 都通过；改了界面再跑 `npm run test:e2e`。
- 不提交：真实客户数据、API Key、`.env`、`release/`、`dist/`、`.next/`。

## 开 PR

- 目标分支 `main`，按 PR 模板填写：改了什么、怎么验证的、哪些没验证、需要负责人决定的事。
- CI（GitHub Actions）会跑三项：lint + 测试、浏览器端到端测试、交接检查（改了 `app/`、`desktop/` 却没更新 `docs/HANDOFF.md` 会失败）。三项都要绿。
- `CODEOWNERS` 会自动请负责人审。
- **合并需要负责人同意**；不要自己合并，也不要直接推 `main`。

## 结束一项工作

- 更新 `docs/HANDOFF.md`（当前状态、任务板），在 `docs/handoff-log.md` 最上面加一条。
- 真的验证过的功能，在 `docs/features.json` 里把对应平台改成 `true`。
- 新的产品决定写进 `docs/DECISIONS.md`。
- 用四段汇报：做了什么 / 没做好的地方 / 需要你做的 / 建议下一步。
