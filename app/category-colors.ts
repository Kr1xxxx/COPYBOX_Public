export const UNCATEGORIZED_COLOR = "#C7C7CC";

const CATEGORY_PALETTE = [
  "#F06F7D",
  "#FF806B",
  "#F4B64A",
  "#E3C653",
  "#A5CE63",
  "#62C483",
  "#53C4A1",
  "#4DBFC4",
  "#67AFE2",
  "#7898E5",
  "#887FE2",
  "#A27DDF",
  "#BE78D3",
  "#D978BD",
  "#EB7DA1",
  "#C78ADE",
  "#E58B72",
  "#A58AE3",
  "#E783B1",
  "#ED7187",
] as const;

function hashFolderName(folder: string) {
  let hash = 2166136261;
  for (const character of folder) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildCategoryColorMap(folderNames: readonly string[]) {
  const folders = [...new Set(folderNames.map((folder) => folder.trim()).filter(Boolean))]
    .sort((first, second) => first < second ? -1 : first > second ? 1 : 0);
  const usedColors = new Set<string>();
  const colors: Record<string, string> = {};

  for (const folder of folders) {
    const preferredIndex = hashFolderName(folder) % CATEGORY_PALETTE.length;
    let color = CATEGORY_PALETTE[preferredIndex];
    for (let offset = 1; usedColors.has(color) && offset < CATEGORY_PALETTE.length; offset += 1) {
      color = CATEGORY_PALETTE[(preferredIndex + offset) % CATEGORY_PALETTE.length];
    }
    colors[folder] = color;
    usedColors.add(color);
  }

  return colors;
}
