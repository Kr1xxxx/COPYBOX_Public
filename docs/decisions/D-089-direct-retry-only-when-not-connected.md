### D-089 Direct retry only when the proxy route could not connect (2026-10-20)
- Context (owner, 2026-10-20, in the ponytail review of #255): the app tries the system proxy first and then a direct
  connection (D-085 follow-up, #255). Any failure on the first route sent the request again directly, so a request
  that reached the server but timed out on the way back was sent twice; for `POST /api/auth/code` that is a second
  验证码 email.
- Decision: `cloud_request` (`src-tauri/src/cloud.rs`) moves to the direct route only when the first route could not
  connect at all (name lookup, proxy, TCP or TLS failure, or no connection within 10 s). Once connected, a timeout or a
  broken answer is returned as the error and not sent again. Both routes stay.
- The update check (`update.rs`) keeps trying both routes on any failure: it only reads a file, so a second request
  does no harm.
- Effect: a proxy that cannot reach copyboxx.com still falls back to direct; a slow answer can no longer cause a second
  email. The worst wait for a broken proxy is 10 s instead of 30 s before the direct try.
