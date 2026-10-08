# Clipbox

Clipbox 是一个打开即用的本地加密复制盒。macOS 版包含“秘密”和“话术”两个板块；Windows 版只提供话术。

## 本地运行

需要 Node.js 22.18 或更高版本：

```bash
npm install
npm run dev
```

然后访问 `http://localhost:3000/`。

## macOS 桌面应用

```bash
npm run desktop:pack
```

完成后可在 `release/mac-arm64/Clipbox.app` 找到独立应用。它会在应用内部启动本地服务，不需要手动打开浏览器；数据保存在 Clipbox 自己的 macOS 应用数据目录中。

## Windows 桌面应用

```bash
npm run desktop:pack:win
```

安装包输出到 `release/Clipbox-Setup-0.1.0-x64.exe`。Windows 版支持 Windows 10/11 x64，只提供话术，首次启动为空；可以导入 Clipbox 加密 JSON 备份或手动新增，但不提供任何导出功能。混合备份只导入话术，秘密会被跳过。

## 功能

- 启动免密码，使用本机随机密钥自动打开
- PBKDF2-SHA256（310,000 次迭代）派生密钥
- AES-256-GCM 加密全部条目
- 提示词搜索、上下键选择、Enter 复制
- 桌面端复制后 60 秒清理未被更改的剪贴板内容，隐藏窗口后仍生效；浏览器版受剪贴板权限限制
- 启动读取异常时保留原数据和本机密钥，显示错误并允许重试，不会自动覆盖为空库
- 新增、编辑、删除条目
- 话术总结可手动填写；点击“AI 总结”后会在本机生成十字以内总结，生成后仍可修改
- 常用条目置顶，并按最近复制时间自动排序
- 左侧目录导航；在侧栏创建目录，并在新增或编辑弹窗中下拉选择目录
- 秘密目录既可选择已有目录，也可直接手写新目录
- 编辑后可“保存并复制”，也可按 `⌘⇧Enter` 一步完成
- macOS 菜单栏常驻，按 `⌥ Space` 快速搜索，复制后自动收起
- Windows 系统托盘常驻，按 `Ctrl+Alt+Space` 快速搜索，复制后自动收起
- 支持 `⌘K` 搜索、`⌘N` 新增、方向键选择、Enter 复制、`⌘Enter` 保存和 Esc 返回
- 桌面版失焦、最小化或隐藏时立即暂停界面动画；前台 30 秒无操作后暂停动画和光标闪烁，操作后恢复。闲置不会关闭保险库、本地命令或剪贴板清理计时器。
- 界面只导出话术备份；秘密没有界面导出入口
- 话术和秘密分别使用独立备份密码加密，不在文件中携带本机密钥
- 导入先解密校验，再按备份类型安全合并或覆盖；兼容旧版备份
- 无账号、无服务器、无远端数据库

## 让其他 Codex 任务直接修改话术

打开 Clipbox 后，其他任务可以直接调用本机的 `clipbox` 命令。修改会经过当前加密写入队列，立即出现在已打开的软件中，不需要导出、导入或刷新。

```bash
clipbox status
clipbox list
clipbox get CB-0003
clipbox add --title "报价跟进" --content "May I follow up on the quotation?" --folder "跟进"
clipbox update CB-0003 --title "新标题" --content "Updated message"
clipbox move CB-0003 --folder "成交"
clipbox delete CB-0003 --confirm
```

秘密卡片可复制稳定引用，而不会把秘密明文放进剪贴板。将引用交给其他本机任务后，可按精确引用读取：

```bash
clipbox secret get "clipbox://secret/<ID>" --json
```

`--json` 响应包含秘密值，调用任务应直接用于目标 API，不要在回复或日志中打印。秘密不支持列表、搜索、批量读取或通过本地命令修改。

秘密备份没有应用内按钮。用户明确要求后，协助任务可通过标准输入传递独立密码，并直接写入当前用户专属的加密文件；命令不会打印秘密或密文，也不会覆盖已有文件：

```bash
printf '%s' '{"password":"至少八个字符的独立密码"}' | clipbox secret export --output "/目标目录/clipbox-secrets.json" --stdin --confirm
```

需要较长或带引号的内容时可通过标准输入传入 JSON：

```bash
printf '%s' '{"title":"报价跟进","content":"May I follow up?","folder":"跟进"}' | clipbox add --stdin
```

所有命令都可加 `--json` 获取适合任务读取的结构化结果。话术编号固定不变；删除和秘密备份必须显式加 `--confirm`。本地接口允许通过不可猜测的精确引用读取单个秘密，但不提供秘密索引，也不能读取本机密钥。Clipbox 关闭后接口也会关闭。

## 安全边界

保险库和本机解密密钥保存在 Clipbox 自己的本地应用数据中。macOS 和浏览器版在清理应用数据前应分别备份话术和秘密；Windows 版不提供导出，因此在 Windows 上新建或修改的话术会随应用数据删除而无法恢复。备份密码独立于本机密钥且无法找回，请妥善保存。免密启动侧重个人设备上的使用便捷性，不能防止能够读取当前用户数据的其他程序、扩展或恶意软件，因此不建议把它作为加密货币助记词等高价值秘密的唯一存储。

## 构建检查

```bash
npm test
```
