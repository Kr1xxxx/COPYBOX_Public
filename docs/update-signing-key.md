# 更新签名钥匙：生成和保管（D-053）

自动更新只会安装用这把钥匙签过名的安装包。私钥只能在你自己的电脑和 GitHub 的加密设置里，**绝不能发到聊天、仓库或任何云端会话**。
公钥（`.pub` 文件）没有秘密，可以发给 Claude，写进 App。

## 一、在你电脑上生成（只做一次）

需要 Node.js 22 或更新的版本（nodejs.org 下载）。在仓库目录里（或只下载 `tools/update-signing.mjs` 这一个文件）打开终端：

```bash
node tools/update-signing.mjs keygen --out copyboxx-update-key.txt
```

它会让你输两次密码（至少 12 个字符，记在纸上或密码管理器里）。完成后有两个文件：

- `copyboxx-update-key.txt`：**私钥**，已用密码加密。
- `copyboxx-update-key.txt.pub`：公钥，把里面两行发给 Claude。

## 二、存进 GitHub（只做一次）

方法 A，用 gh 命令（已登录 GitHub 的电脑上）：

```bash
gh api -X PUT repos/Kr1xxxx/Clipbox/environments/update-signing \
  -F "deployment_branch_policy[protected_branches]=false" -F "deployment_branch_policy[custom_branch_policies]=true"
gh api -X POST repos/Kr1xxxx/Clipbox/environments/update-signing/deployment-branch-policies -f name=main -f type=branch
gh secret set UPDATE_SIGNING_KEY --env update-signing --repo Kr1xxxx/Clipbox < copyboxx-update-key.txt
gh secret set UPDATE_SIGNING_PASSWORD --env update-signing --repo Kr1xxxx/Clipbox   # 会提示你输入密码
```

方法 B，在 GitHub 网站上：

1. 打开仓库 Kr1xxxx/Clipbox → Settings → Environments → New environment，名字填 `update-signing`。
2. Deployment branches and tags 选 Selected branches and tags → Add deployment branch rule → 填 `main`。
3. 同一页 Environment secrets → Add secret：
   - 名字 `UPDATE_SIGNING_KEY`，内容是 `copyboxx-update-key.txt` 的**全部文字**（用记事本打开、全选、复制）。
   - 名字 `UPDATE_SIGNING_PASSWORD`，内容是你的密码。

## 三、备份

把 `copyboxx-update-key.txt` 复制到 U 盘（或存进密码管理器的附件），和密码分开放。
丢了私钥就再也发不了自动更新，所有员工得手动重装一次。电脑上的那份备份好以后可以删掉。

## 以后换钥匙

先用旧钥匙签一个带新公钥的版本发出去，等大家都更新到这个版本后，再把 GitHub 里的两个 secret 换成新钥匙。
