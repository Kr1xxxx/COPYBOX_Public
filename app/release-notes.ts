import type { ReleaseNote } from "./whats-new.ts";

// What staff see once after updating to a version (D-070, docs/whats-new.md). Newest first; `version` is the app version
// of the build that carries it (1.<preview>.0). Only notable additions in short plain Chinese, at most 6 lines;
// no button or design tweaks, no old changes. The owner approves the text before the build ships.
export const RELEASE_NOTES: readonly ReleaseNote[] = [];
