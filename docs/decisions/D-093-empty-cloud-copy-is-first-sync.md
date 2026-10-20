### D-093 An empty or missing cloud copy is never "delete everything" (2026-10-20)
- Context (ponytail audit 2026-10-20, item 1). Every sync compares this computer, the cloud copy and the base of the
  last sync; an entry that is in the base and untouched here but missing in the cloud counts as "deleted on another
  computer". When the server answered "no copy" (`data: null`, the row lost or restored) the app merged against the old
  base, so every untouched entry here was deleted, and the next sync pushed those deletions to every other computer.
  The removal guard (`tooManyRemovals`) only steps in above 20 entries, so 15 账号 or 18 话术 were wiped without a word.
- Decision: in `syncOnce`, each section (话术, 账号) of a cloud copy that is missing or has no entries in that section is
  a first sync again: it merges against an empty base, keeps everything on both sides, counts no removals, and refills
  the cloud. Per section, because a computer whose 账号 page is locked uploads 话术 with no 账号 (after a lost row that
  copy would otherwise wipe the 账号 on every other computer). A locked round keeps its old 账号 base.
  The guard with its "more than 20 and more than half" rule stays as it is.
- Trade-off: deleting *every* 话术 (or every 账号) on one computer no longer empties the others; the next sync brings
  them back there. Losing data silently is the worse failure, and this case is rare.
