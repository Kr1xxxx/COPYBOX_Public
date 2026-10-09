import fs from "node:fs";

// page.tsx is being split into component files. Source-text tests that care about "the UI" read all of them,
// so an assertion keeps working when a piece moves from one file to another.
const FILES = ["page.tsx", "item-editor.tsx", "settings-folders.tsx", "settings.tsx", "dialogs.tsx", "fill-panel.tsx", "ai-settings.tsx", "ai-client.ts", "platform.ts", "preferences.ts"];

export function readUiSource() {
  return FILES
    .map((name) => new URL(`../../app/${name}`, import.meta.url))
    .filter((url) => fs.existsSync(url))
    .map((url) => fs.readFileSync(url, "utf8"))
    .join("\n");
}
