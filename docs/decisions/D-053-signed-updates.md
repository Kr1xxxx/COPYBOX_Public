### D-053 Windows updates are signed; the app installs only installers signed with our key (2026-10-14)
- Context (owner, 2026-10-14, audit 「審計 · 網站與 App 現況審查」 severe item 1, decision card 「加签名」): D-047 checks size and
  SHA-256, but both come from the same `latest.json` on copyboxx.com as the installer. Whoever controls the website or
  its Cloudflare token could make every Windows app silently install their program. The owner chose a free signature
  (no paid code-signing certificate; D-013 stays) and agreed to one new Rust dependency and to changing the update path.
- Decision:
  - **Key**: one Ed25519 key in minisign format, made with `node tools/update-signing.mjs keygen` (Node's own crypto,
    no new JS dependency). The private key file is encrypted with a password. Both live only in the GitHub environment
    `update-signing` (secrets `UPDATE_SIGNING_KEY`, `UPDATE_SIGNING_PASSWORD`; deployment branches: `main` only) and in
    the owner's offline backup. Never in the repo, a chat, the website, Cloudflare or a cloud session.
    The public key is `src-tauri/update-public-key.txt`, built into the app (`include_str!`).
  - **Signing** (`.github/workflows/tauri.yml`, job `sign-update`): only for `workflow_dispatch` + `publish_test_build`
    on `main`, in a separate Linux job that uses the environment, so pull-request runs and the build machines never see
    the key. It signs `Copyboxx-Windows-setup.exe` (prehashed minisign, BLAKE2b-512) with the trusted comment
    `version:<app version>\tfile:<name>\ttimestamp:<unix>`, checks the result against the committed public key, and
    the `.sig` becomes a release asset next to the installer. No key → the job fails and nothing is published.
  - **Website** (`tools/website/build.mjs`): copies `<installer>.sig` into `latest.json` as `signature` after checking it
    against the public key and the installer's version; a bad signature stops the build. A release without a `.sig`
    (published before this decision) still builds, with a warning, and its `latest.json` has no `signature`.
  - **App** (`src-tauri/src/update.rs`, crate `minisign-verify` 0.3, no dependencies of its own): a newer version is
    offered only when `signature` is made with the built-in key, prehashed, and its signed comment names exactly the
    manifest's version (an older signed installer cannot be passed off as newer). Otherwise the check counts as an
    error and nothing is shown, not even 「下载」, because such a manifest cannot be ours. While downloading, the bytes
    are fed to the signature check as well as SHA-256; if they do not match, the file is deleted, nothing is started,
    and the banner says 「更新没成功：安装包不是官方发布的，为了安全没有安装」 with only 「知道了」 (no 重试, no 去网站下载).
- Consequences:
  - Apps built before this change (1.71 and the like) do not check signatures; the first signed version reaches them
    the old way. From then on every
    `latest.json` must carry a signature, or those apps see no update.
  - Losing the private key (and its backup) means no automatic update can ever be published again: every Windows user
    would have to install a new build by hand once. Changing the key needs one more app version signed with the old key
    that carries the new public key.
  - Someone with push rights to `main` and the environment can still sign; protect the GitHub account (two-step login).
  - Installers stay unsigned for Windows itself (SmartScreen still warns on a manual install, D-013).
- Status: accepted (owner, 2026-10-14); waits for the owner's real public key before the first signed release.
