// Pinned folders (目录置顶): a pinned folder sits at the top of the sidebar, several pinned ones in the order they
// were pinned. Only this device remembers it (localStorage); the folder order in the vault does not change.

import { useSyncExternalStore } from "react";

export const FOLDER_PINS_KEY = "clipbox.folder-pins.v1";
export type FolderPinScope = "snippet" | "secret" | "image";
export type FolderPins = Partial<Record<FolderPinScope, string[]>>;

const SCOPES: readonly FolderPinScope[] = ["snippet", "secret", "image"];
const NO_PINS: readonly string[] = Object.freeze([]);

export function parseFolderPins(raw: string | null): FolderPins {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const pins: FolderPins = {};
    for (const scope of SCOPES) {
      const list = (parsed as Record<string, unknown>)[scope];
      if (!Array.isArray(list)) continue;
      const names = [...new Set(list.filter((name): name is string => typeof name === "string" && name.trim() !== ""))];
      if (names.length) pins[scope] = names;
    }
    return pins;
  } catch {
    return {};
  }
}

// Pinned names first (in pin order), then the rest in their saved order. Pins of folders that no longer exist are ignored.
export function pinnedFirst<T>(items: readonly T[], pins: readonly string[], nameOf: (item: T) => string): T[] {
  if (!pins.length) return items.slice();
  const byName = new Map(items.map((item) => [nameOf(item), item]));
  const top = pins.flatMap((name) => byName.has(name) ? [byName.get(name) as T] : []);
  const pinned = new Set(pins);
  return [...top, ...items.filter((item) => !pinned.has(nameOf(item)))];
}

// A newly pinned folder goes below the ones pinned before it.
export function togglePinnedName(pins: readonly string[], name: string): string[] {
  return pins.includes(name) ? pins.filter((entry) => entry !== name) : [...pins, name];
}

export function renamePinnedName(pins: readonly string[], from: string, to: string): string[] {
  if (!pins.includes(from) || from === to) return pins.slice();
  return pins.filter((entry) => entry !== to).map((entry) => entry === from ? to : entry);
}

// Dragging and the move buttons only swap folders inside the same group (pinned with pinned, the rest with the rest).
export function sameFolderGroup(pins: readonly string[], a: string, b: string) {
  return pins.includes(a) === pins.includes(b);
}

// Neighbour of `name` in the shown list, skipping nothing but staying in its own group; "" when there is none.
export function folderGroupNeighbour(shown: readonly string[], pins: readonly string[], name: string, delta: -1 | 1) {
  const target = shown[shown.indexOf(name) + delta];
  return target !== undefined && sameFolderGroup(pins, name, target) ? target : "";
}

let cache: FolderPins | null = null;
const listeners = new Set<() => void>();

function readPins(): FolderPins {
  if (cache) return cache;
  try { cache = parseFolderPins(localStorage.getItem(FOLDER_PINS_KEY)); } catch { cache = {}; }
  return cache;
}

export function updateFolderPins(scope: FolderPinScope, update: (pins: readonly string[]) => string[]) {
  const current = readPins();
  const next = update(current[scope] ?? NO_PINS);
  cache = { ...current, [scope]: next };
  if (!next.length) delete cache[scope];
  try { localStorage.setItem(FOLDER_PINS_KEY, JSON.stringify(cache)); } catch { /* pins last for this session only */ }
  listeners.forEach((listener) => listener());
}

export const toggleFolderPin = (scope: FolderPinScope, name: string) => updateFolderPins(scope, (pins) => togglePinnedName(pins, name));
export const renameFolderPin = (scope: FolderPinScope, from: string, to: string) => updateFolderPins(scope, (pins) => renamePinnedName(pins, from, to));
export const removeFolderPin = (scope: FolderPinScope, name: string) => updateFolderPins(scope, (pins) => pins.filter((entry) => entry !== name));
export const reorderFolderPins = (scope: FolderPinScope, source: string, target: string) => updateFolderPins(scope, (pins) => {
  const from = pins.indexOf(source);
  const to = pins.indexOf(target);
  if (from < 0 || to < 0 || from === to) return pins.slice();
  const next = pins.slice();
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useFolderPins(scope: FolderPinScope): readonly string[] {
  return useSyncExternalStore(subscribe, () => readPins()[scope] ?? NO_PINS, () => NO_PINS);
}
