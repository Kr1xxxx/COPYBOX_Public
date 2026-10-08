const fs = require("node:fs");

const DEFAULT_WINDOW_BOUNDS = Object.freeze({ width: 680, height: 620 });
const MIN_WINDOW_WIDTH = 500;
const MIN_WINDOW_HEIGHT = 520;
const MAX_WINDOW_SIZE = 10000;
const MIN_VISIBLE_EDGE = 80;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidSize({ width, height }) {
  return isFiniteNumber(width)
    && isFiniteNumber(height)
    && width >= MIN_WINDOW_WIDTH
    && height >= MIN_WINDOW_HEIGHT
    && width <= MAX_WINDOW_SIZE
    && height <= MAX_WINDOW_SIZE;
}

function intersectsWorkArea(bounds, workArea) {
  if (![workArea?.x, workArea?.y, workArea?.width, workArea?.height].every(isFiniteNumber)) return false;
  const visibleWidth = Math.max(
    0,
    Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x),
  );
  const visibleHeight = Math.max(
    0,
    Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y),
  );
  return visibleWidth >= MIN_VISIBLE_EDGE && visibleHeight >= MIN_VISIBLE_EDGE;
}

function normalizeWindowBounds(bounds, workAreas) {
  if (!bounds || !isValidSize(bounds) || !isFiniteNumber(bounds.x) || !isFiniteNumber(bounds.y)) {
    return { ...DEFAULT_WINDOW_BOUNDS };
  }

  const normalized = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  };
  if (!Array.isArray(workAreas) || !workAreas.some((workArea) => intersectsWorkArea(normalized, workArea))) {
    return { ...DEFAULT_WINDOW_BOUNDS };
  }
  return normalized;
}

function createWindowStateStore({ filePath, getWorkAreas }) {
  return {
    load() {
      try {
        const storedBounds = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return normalizeWindowBounds(storedBounds, getWorkAreas());
      } catch {
        return { ...DEFAULT_WINDOW_BOUNDS };
      }
    },
    save(bounds) {
      try {
        const normalized = normalizeWindowBounds(bounds, getWorkAreas());
        const temporaryPath = `${filePath}.tmp-${process.pid}`;
        fs.writeFileSync(temporaryPath, `${JSON.stringify(normalized)}\n`, "utf8");
        fs.renameSync(temporaryPath, filePath);
        return true;
      } catch {
        return false;
      }
    },
  };
}

module.exports = {
  DEFAULT_WINDOW_BOUNDS,
  createWindowStateStore,
  normalizeWindowBounds,
};
