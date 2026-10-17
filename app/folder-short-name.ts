// Four-character folder labels for the mini window's folder row (owner, 2026-10-16 and 2026-10-17, D-074; it was two
// characters since 2026-10-13). Four-character names such as 询盘接待 or 开场接待 show whole; longer ones show their
// first four characters. The full name stays available as the tab's title and accessible name.
const SHORT_LENGTH = 4;
// Latin letters and digits are about half as wide as a Chinese character, so up to 8 of them fit the same space.
const LATIN_SHORT_LENGTH = 8;
const LATIN_HEAD = /^[A-Za-z0-9]+/;

function graphemes(value: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(value), (part) => part.segment);
  }
  return Array.from(value);
}

function shorten(value: string): string {
  const latin = value.match(LATIN_HEAD)?.[0];
  if (latin) return latin.slice(0, LATIN_SHORT_LENGTH);
  return graphemes(value).slice(0, SHORT_LENGTH).join("");
}

export const FOLDER_SHORT_NAME_ERROR = "最多四个字";

// A short name the person sets for one of their own folders (D-049). Returns the trimmed value ("" = use the default),
// or null when it is too long to show whole: nothing is cut silently, the person is told 「最多四个字」 instead.
export function normalizeFolderShortName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return "";
  return shorten(value) === value ? value : null;
}

// `override`: the short name the person set for the folder (vault `folderShortNames`, image folder `shortName`).
export function folderShortName(name: string, override?: string): string {
  const custom = override?.trim();
  if (custom) return shorten(custom);
  const folder = name.trim();
  if (folder === "未分类") return folder;
  return shorten(folder);
}
