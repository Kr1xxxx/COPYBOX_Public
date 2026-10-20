### D-095 Update download: system proxy first, then direct (2026-10-20)
- Context (owner picked item 6 of the 2026-10-20 ponytail audit): since 2.36 the update check tries the system proxy
  and then a direct connection (#255), but downloading the installer still used one plain client. On a computer whose
  proxy cannot reach copyboxx.com the check succeeded directly, the banner offered the new version, and 「立即更新」
  failed every time with a network error.
- Decision: the update check and the installer download share one helper, `get_first` in `src-tauri/src/update.rs`,
  which tries `cloud::clients()` in order (system proxy, then direct) and moves on when a route gets no answer at all.
  Both only read a file, so a second request is harmless (unlike the sign-in requests of D-089).
- Effect: if the check can see a new version, the download takes the same way out and succeeds.
