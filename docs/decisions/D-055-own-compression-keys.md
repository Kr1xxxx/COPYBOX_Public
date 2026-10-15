### D-055 Image compression uses only keys each person fills in; no built-in key, no website proxy (2026-10-15)
- Context (owner, 2026-10-15, thread 「做代理」): the repo is public and anything built into the installer can be dug out,
  so the owner keeps the secret `CLIPBOX_TINIFY_KEYS` empty and revoked the two old keys. A proxy on copyboxx.com that
  holds the key and serves anyone with a 企业同步码 was built (PR #173) and then dropped by the owner before merging:
  「密钥改成个人自己填写，而不是走网站或者走企业同步码」.
- Decision: every person applies for their own free TinyPNG key and fills it in 设置 → 数据 → 图片压缩 (up to two, D-037 /
  PR #158). Without a key, pictures are saved uncompressed with the existing hint. copyboxx.com has no compression
  endpoint and holds no TinyPNG key.
- Consequences: no shared quota to abuse and nothing on the site to attack; each person's 500 free compressions a month
  are their own. Staff who never fill a key get uncompressed pictures. Revisit only if the owner asks again.
- Status: accepted (owner, 2026-10-15).
- Follow-up (2026-10-15, PR for the per-person keys): the build-time key path (`CLIPBOX_TINIFY_KEYS` in tauri.yml, the
  `tinify_builtin_count` command, `builtin:N` names) is removed from the code, and the key row in 设置 is no longer folded
  under 高级, so nobody can ship or expect a built-in key again.
