// What each variable block remembers. Held in memory only (never saved): the values are often customer names.
export const MEMORY_SIZE = 3;

// Every variable called Name starts with these three, so a quick reply needs no typing. Friend is the default.
export const NAME_OPTIONS = ["Beautiful", "Friend", "Lovely"] as const;
export const DEFAULT_VALUES: Record<string, string> = { Name: "Friend" };

// The three above are always on offer, so they never take a place in the recent list.
export function isDefaultOption(name: string, value: string): boolean {
  return name === "Name" && NAME_OPTIONS.some((option) => option.toLowerCase() === value.trim().toLowerCase());
}

export type ValueMemory = Record<string, string[]>;
// The values the person pinned, per name. A pinned value is also in the memory and is never pushed out by a new one.
export type PinnedValues = Record<string, string[]>;

export function isPinned(pins: PinnedValues, name: string, value: string): boolean {
  return (pins[name] || []).includes(value);
}

// Newest first; pushing a fourth value out removes the oldest one that is not pinned. When all three are pinned the new value is not kept.
export function rememberValues(memory: ValueMemory, values: Record<string, string>, pins: PinnedValues = {}): ValueMemory {
  const next = { ...memory };
  for (const [name, raw] of Object.entries(values)) {
    const value = raw.trim();
    if (!value || (isDefaultOption(name, value) && !isPinned(pins, name, value))) continue;
    const list = [value, ...(next[name] || []).filter((entry) => entry !== value)];
    while (list.length > MEMORY_SIZE) {
      let drop = -1;
      for (let index = list.length - 1; index >= 0; index -= 1) if (!isPinned(pins, name, list[index])) { drop = index; break; }
      if (drop < 0) break;
      list.splice(drop, 1);
    }
    next[name] = list.slice(0, MEMORY_SIZE);
  }
  return next;
}

// Pinned values first, in the order they were pinned (they survive a reload), then the recent ones newest first, three in all.
export function memoryOptions(memory: ValueMemory, pins: PinnedValues, name: string): string[] {
  const pinned = pins[name] || [];
  return [...pinned, ...(memory[name] || []).filter((value) => !pinned.includes(value) && !isDefaultOption(name, value))].slice(0, MEMORY_SIZE);
}

export function latestValues(memory: ValueMemory): Record<string, string> {
  return Object.fromEntries(Object.entries(memory).filter(([, list]) => list.length > 0).map(([name, list]) => [name, list[0]]));
}

// Pin the value, or unpin it when it is already pinned. A value that is not remembered yet is added; with three pinned values there is no room.
export function togglePin(memory: ValueMemory, pins: PinnedValues, name: string, raw: string): { memory: ValueMemory; pins: PinnedValues; result: "pinned" | "unpinned" | "full" | "empty" } {
  const value = raw.trim();
  if (!value) return { memory, pins, result: "empty" };
  const pinned = pins[name] || [];
  if (pinned.includes(value)) return { memory, pins: { ...pins, [name]: pinned.filter((entry) => entry !== value) }, result: "unpinned" };
  if (pinned.length >= MEMORY_SIZE) return { memory, pins, result: "full" };
  const nextPins = { ...pins, [name]: [...pinned, value] };
  return { memory: rememberValues(memory, { [name]: value }, nextPins), pins: nextPins, result: "pinned" };
}

// Only the pinned values are kept on this device (the person chose them on purpose); the recent ones are forgotten when the page is closed.
export const PINNED_KEY = "clipbox.pinned-values.v1";
export function parsePinned(raw: string | null): PinnedValues {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const pins: PinnedValues = {};
    for (const [name, list] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const values = Array.from(new Set(list.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "" && entry.length <= 200).map((entry) => entry.trim()))).slice(0, MEMORY_SIZE);
      if (values.length > 0) pins[name] = values;
    }
    return pins;
  } catch { return {}; }
}

// Remove a remembered value everywhere: from the list and from the pinned ones.
export function deleteValue(memory: ValueMemory, pins: PinnedValues, name: string, raw: string): { memory: ValueMemory; pins: PinnedValues } {
  const value = raw.trim();
  return {
    memory: { ...memory, [name]: (memory[name] || []).filter((entry) => entry !== value) },
    pins: { ...pins, [name]: (pins[name] || []).filter((entry) => entry !== value) },
  };
}

// Drag one value onto the place of another. Pinned values stay in front of the others, so a value can only change places inside its own group.
export function moveOption(memory: ValueMemory, pins: PinnedValues, name: string, value: string, target: string): { memory: ValueMemory; pins: PinnedValues } {
  const options = memoryOptions(memory, pins, name);
  const from = options.indexOf(value);
  const to = options.indexOf(target);
  const pinnedNow = isPinned(pins, name, value);
  if (from < 0 || to < 0 || from === to || pinnedNow !== isPinned(pins, name, target)) return { memory, pins };
  const next = [...options];
  next.splice(from, 1);
  next.splice(to, 0, value);
  const pinnedList = next.filter((entry) => isPinned(pins, name, entry));
  const known = new Set(memory[name] || []);
  return { memory: { ...memory, [name]: next.filter((entry) => known.has(entry)) }, pins: { ...pins, [name]: pinnedList } };
}
