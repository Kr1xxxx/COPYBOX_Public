# Tauri 1.62 audit fixes

- Date: 2026-10-13 · Thread/agent: Codex Tauri audit follow-up
- What changed: Fixed interrupted account decryption by marking the existing lock as migrating before rewriting stores, with rollback if removing the lock fails. Full restores now clear image databases/tables absent from the backup, including on rollback. The exit callback in app/page.tsx waits for the immediate persistence queue before draining lazy writes and acknowledging. Variable inputs keep their focus-time selection on the first mouse click in WebKit, while subsequent clicks retain normal caret placement. No encryption format, storage key, dependency, Rust source, or version change.
- User-visible change (plain Chinese, for the preview changelog): 修复账号关闭加密中断恢复、备份图片残留、退出保存等待和 Mac 变量覆盖输入。
- Verification: Regression tests were run failing before fixes. After fixes: 389/389 unit tests; lint and typecheck pass; Rust 33/33 pass; Chromium 203/203 pass; WebKit 202 pass and one pre-existing image-grid keyboard-focus test fails. Both previously failing variable tests pass. The prior Chromium folder-animation timing failure did not recur. Rust socket tests required a private TMPDIR because they chmod their socket parent; no Rust code was changed for this environment issue.
- Native macOS: Built arm64 release apps locally. Installed the patched 1.62.0 Tauri app after backing up its app/data; verified its executable matches the release build, version/build time, search, mini/full window, clipboard and restart. The original variable click/type defect is fixed in the installed WKWebView, and a second click still permits caret editing. A separate com.clipbox.tauri.audit build used synthetic data: a mixed-key interrupted-disable checkpoint unlocked through the real UI and recovered the latest login plus TOTP; native file-picker image import followed by restoring a backup with no image DB removed the image and thumbnail; saving a visually confirmed snippet then immediately quitting retained it after restart. Slow-save acknowledgement is additionally exercised by a controlled encryption delay in browser E2E, not by injecting faults into the production app.
- Not done / risks: No Windows machine was available. The existing 1.5-second native exit timeout is unchanged; this is not a guarantee against a stalled disk, forced termination, or power loss. The preview app still fails strict codesign resource validation, as did the original 1.62 package; signing/notarization is not validated. Real passwords, production backup restores, AI/TinyPNG credentials and remote shared services were not exercised. Full test coverage does not prove every application path is defect-free.
- Next step: The four scoped fixes and local macOS verification are complete. The owner requested GitHub upload: submit source, tests and this verification record on codex/fix-tauri-v162-audit as a draft PR. No merge, version bump or installer release is included. The old Electron checkout, installed bundle, running process and CLI are preserved. Windows acceptance, the existing WebKit focus test and release signing can be handled separately.


## 四项修复与检查报告

检查日期：2026-10-13。修复基线：`6985f9fcbecbbe2861d74ca3a6fafd6383a4e36d`（Tauri 1.62.0）。本次仅包含 Tauri 修复、测试及本记录，旧 Electron 保持不变。没有改动依赖、加密格式、存储键、Rust 源码或版本文件。

| 问题 | 修复后的行为 | 对应验证 |
| --- | --- | --- |
| 关闭账号加密被中断，正确密码仍读不到部分账号 | 写入前持久化已有的 migrating 阶段；中断后经正常解锁自动恢复；移除锁失败时回滚 | 逐一重放写入检查点，验证最新账号、验证码、图标保留，且不依赖旧迁移备份；原生隔离实例解锁混合密钥快照后读回最新合成账号及验证码，阶段回到 ready |
| 恢复缺少图片库或部分表的完整备份时残留图片 | 对固定图片库集合执行完整替换，备份中缺失的库/表清空；失败回滚遵循相同规则 | 单元测试覆盖缺库、缺表和回滚；双浏览器真实 IndexedDB 和 UI 导出/恢复；原生导入合成 PNG 后恢复无图片库备份，界面图片数、blobs、thumbs 均回到 0 |
| 退出过早确认，即时保存尚未落盘 | 先等待即时保存队列，再刷新延迟写入；仍有延迟写入时不确认 | 暂停真实加密 Promise：未落盘时确认次数为 0，放行后确认且重载保留新增条目；原生可见有效表单保存后立即正常退出，重新启动仍保留合成话术 |
| Mac 鼠标点击变量后输入混入旧值 | 初次聚焦保留全选，已聚焦时正常放置光标 | 两个原有 WebKit 变量用例通过；本机 WKWebView 中 Friend → Amanda 正确覆盖，再次点击输入 X 得到 AmaXnda |

### 自动化和构建结果

以下为本机已完成的检查记录；GitHub CI 的结果以 PR 检查页面为准。

| 检查 | 结果 |
| --- | --- |
| 修复前新增回归测试 | 5 项新增单元测试、4 项定向 WebKit 用例失败，确认能捕获问题 |
| 修复后定向检查 | 24/24 存储与加密测试、4/4 WebKit 用例通过 |
| npm test，含前端构建 | 389/389 通过 |
| ESLint / TypeScript | 通过 / 通过 |
| Rust release tests | 33/33 通过 |
| Chromium 全量 E2E | 203/203 通过，9.9 分钟 |
| WebKit 全量 E2E | 202 通过、1 失败，11.1 分钟；失败自动重试后仍存在 |
| macOS arm64 Tauri release 构建 | 应用标识和隔离 QA 标识均构建成功 |
| git diff --check | 通过 |

Rust 首次执行的两项 socket 测试受临时目录权限限制；改用独立 TMPDIR 后 33 项全部通过，没有为此修改产品或测试代码。测试工具链来自官方源。

仍失败的是既有 `tests/e2e/image-grid.e2e.mjs` 的图片复制按钮键盘焦点用例：Tab 往返后的焦点落在输入框。该问题在修复前审查已出现，相关产品代码和测试本次未修改。没有删掉、放宽或跳过测试。原先 Chromium 的目录展开动画时序失败本轮未出现。

### 原生实操及数据保护

覆盖性操作使用独立 `com.clipbox.tauri.audit` 实例，只放合成账号、验证码、图片和话术；正式实例为 `com.clipbox.tauri`。本机修复版仍显示 1.62.0，构建时间为 2026-10-13 11:11，可执行文件与固定构建副本哈希一致。

除上表四项原生检查，还验证了正常启动/退出/重开、原有话术加载、搜索、迷你/完整窗口切换、版本和构建时间、原生剪贴板复制及粘贴回读，并查看实际界面。

结束核对确认：正式 Tauri localStorage 全部键和值与检查前备份一致；旧 Electron 应用关键文件哈希及原进程不变；原 CLI 内容与权限不变。Tauri 测试使用专用 socket。没有上传应用数据、账号备份、密钥、CLI 私有内容或机器配置。

### 覆盖边界

- 无 Windows 实机；win32 浏览器分支检查不能代替 Windows 原生验收。
- 原生退出原有 1.5 秒超时保持不变；不保证磁盘长期卡住、强制终止或断电时完成保存。受控延迟由 E2E 验证，没有向正式应用注入故障。
- 严格 codesign 资源校验仍有原安装包同样的失败。本次验证了实际启动，不代表签名、公证或正式发行验收。
- 未修改真实密码，未在真实数据上覆盖备份或删除内容，未用真实凭据联调 AI、TinyPNG 或企业共享库。
- 原生中断恢复从真实加密函数生成的合成混合密钥快照开始；没有对用户业务数据模拟真实断电。

Windows 验收、既有图片焦点用例和发行签名属于独立后续工作。此上传不包含主分支合并或安装包发布。
