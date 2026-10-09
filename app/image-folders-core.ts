// Pure helpers for the 图片 folders (docs/specs/image-folders.md): which images a filter shows, counts and colours.
// The folder data itself lives in image-store.ts; nothing here touches storage.

import { buildCategoryColorMap } from "./category-colors.ts";
import type { ImageFolder, ImageMeta } from "./image-store";

// "all" | "uncategorized" | "folder:<name>"
export type ImageFilter = string;

export const IMAGE_FILTER_ALL: ImageFilter = "all";
export const IMAGE_FILTER_UNCATEGORIZED: ImageFilter = "uncategorized";
const FOLDER_PREFIX = "folder:";

export function imageFolderFilter(name: string): ImageFilter {
  return `${FOLDER_PREFIX}${name}`;
}

// The folder name a filter points at, or null for 全部图片 / 未分类.
export function folderOfImageFilter(filter: ImageFilter): string | null {
  return filter.startsWith(FOLDER_PREFIX) ? filter.slice(FOLDER_PREFIX.length) : null;
}

// A folder that no longer exists (renamed or deleted elsewhere) falls back to 全部图片.
export function resolveImageFilter(filter: ImageFilter, folders: readonly ImageFolder[]): ImageFilter {
  const name = folderOfImageFilter(filter);
  if (name === null) return filter === IMAGE_FILTER_UNCATEGORIZED ? filter : IMAGE_FILTER_ALL;
  return folders.some((folder) => folder.name === name) ? filter : IMAGE_FILTER_ALL;
}

// An image whose folder is not in the registry counts as 未分类, so the counts always add up.
function folderOf(meta: ImageMeta, names: ReadonlySet<string>): string | null {
  return meta.folder && names.has(meta.folder) ? meta.folder : null;
}

export function filterImagesByFolder(images: readonly ImageMeta[], filter: ImageFilter, folders: readonly ImageFolder[]): ImageMeta[] {
  if (filter === IMAGE_FILTER_ALL) return [...images];
  const names = new Set(folders.map((folder) => folder.name));
  const wanted = folderOfImageFilter(filter);
  return images.filter((meta) => folderOf(meta, names) === wanted);
}

export type ImageFolderCounts = { total: number; uncategorized: number; byFolder: Record<string, number> };

export function countImagesByFolder(images: readonly ImageMeta[], folders: readonly ImageFolder[]): ImageFolderCounts {
  const names = new Set(folders.map((folder) => folder.name));
  const byFolder: Record<string, number> = Object.fromEntries(folders.map((folder) => [folder.name, 0]));
  let uncategorized = 0;
  for (const meta of images) {
    const name = folderOf(meta, names);
    if (name === null) uncategorized += 1;
    else byFolder[name] += 1;
  }
  return { total: images.length, uncategorized, byFolder };
}

export function imageFilterTitle(filter: ImageFilter): string {
  if (filter === IMAGE_FILTER_ALL) return "全部图片";
  return folderOfImageFilter(filter) ?? "未分类";
}

// A colour chosen in the menu wins; otherwise the same automatic colours as the 话术 folders.
export function imageFolderColors(folders: readonly ImageFolder[]): Record<string, string> {
  const colors = buildCategoryColorMap(folders.map((folder) => folder.name));
  for (const folder of folders) if (folder.color) colors[folder.name] = folder.color;
  return colors;
}
