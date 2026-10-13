# Small security hardening (review item 16)

- Date: 2026-10-13 · Thread/agent: coordinator worker W7
- What changed: Site icons refuse every IPv6 form that hides a private IPv4 address (compatible, mapped, translated, NAT64, 6to4) plus multicast, site-local, Teredo and documentation ranges, and never go through a system proxy. The shared 话术 library fetch now checks every redirect hop by hand, never reads more than 5 MB, ignores proxies and refuses this computer, link-local (cloud metadata), multicast and "nowhere" addresses; office network addresses and http stay allowed (D-026). The command line installer no longer writes through links or over someone else's `clipbox`, and rewrites only when the content differs; `CLIPBOX_AUTOMATION_SOCKET_PATH` is only honoured inside its own temporary folder or the app folder, and only a stale socket is ever removed. Waiting command-line requests are always removed when the wait ends. 秘密 backups whose key-stretching count is outside 100,000–5,000,000 are refused.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: `app/data-transfer.ts` and the main vault envelope still accept any iteration count (left for a later change). Not tried on a real Mac.
- Next step: apply the same iteration range in `app/data-transfer.ts`.
