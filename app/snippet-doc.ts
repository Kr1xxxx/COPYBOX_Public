import type { SecretItem, SnippetMeta } from "./clipbox-core";
import { extractPlaceholders, productGroupsForRawProduct, type SnippetImportPreview } from "./snippet-import.ts";

// A 话术 document in the shape of the company's 标准话术库 (template: docs/snippet-doc-template.md, D-067):
//   ## 01 开场接待      a folder (a leading number is dropped)
//   ### 1.1 新询盘      a section inside it
//   **通用开场**        one 话术; the plain lines under it are the message, up to the next ** / ### / ## / ---
// A section with no **…** lines is one 话术 per block of lines; a folder with no ### holds its **…** 话术 directly.
// "> " lines right under a folder become the 使用备注 of its 话术; other "> " lines, "# " and "---" are skipped.
// [名字], $[金额] and other [ ] parts are fill-in blocks, as in every 话术.

export type SnippetDocEntry = { id: string; folder: string; label: string; secret: string; scene: string; action: string; usageNote: string };

export function parseSnippetDocument(markdown: string): { folders: string[]; items: SnippetDocEntry[] } {
  const folders: string[] = [];
  const items: SnippetDocEntry[] = [];
  let folder = "";
  let folderNumber = "";
  let folderNote: string[] = [];
  let section: { number: string; title: string; count: number } | null = null;
  let entry: { title: string; lines: string[] } | null = null;
  const finishEntry = () => {
    if (entry && entry.lines.length && section) {
      section.count += 1;
      items.push({
        id: `STD-${section.number}-${String(section.count).padStart(2, "0")}`,
        folder,
        label: [section.title, entry.title].filter(Boolean).join("｜"),
        secret: entry.lines.join("\n"),
        scene: section.title || entry.title,
        action: entry.title || "",
        usageNote: folderNote.join("\n"),
      });
    }
    entry = null;
  };
  for (const raw of markdown.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim();
    const chapter = line.match(/^##\s+(?:(\d+)[.、\s]\s*)?(.+)$/);
    if (chapter && !line.startsWith("###")) {
      finishEntry();
      folder = chapter[2].trim();
      if (!folders.includes(folder)) folders.push(folder);
      folderNumber = chapter[1] ? String(Number(chapter[1])) : String(folders.length);
      folderNote = [];
      section = null;
      continue;
    }
    const heading = line.match(/^###\s+(\d+(?:\.\d+)*)?\s*(.+)$/);
    if (heading && folder) {
      finishEntry();
      section = { number: heading[1] || `${folderNumber}.${items.length + 1}`, title: heading[2].trim(), count: 0 };
      continue;
    }
    if (line.startsWith("#") || /^-{3,}$/.test(line)) { finishEntry(); continue; }
    if (line.startsWith(">")) { if (folder && !section) folderNote.push(line.replace(/^>\s*/, "")); continue; }
    const title = line.match(/^\*\*(.+)\*\*$/);
    // A folder with 话术 but no ### sections (such as 通用短句): they are numbered under the folder itself.
    if (folder && !section && line) section = { number: folderNumber, title: "", count: 0 };
    if (!folder || !section) continue;
    if (title) { finishEntry(); entry = { title: title[1].trim(), lines: [] }; continue; }
    if (!line) { if (entry?.lines.length && !entry.title) finishEntry(); continue; }
    if (!entry) entry = { title: "", lines: [] };
    entry.lines.push(line);
  }
  finishEntry();
  return { folders, items };
}

export const SNIPPET_DOC_EXTENSIONS = /\.md$/i;
export const SNIPPET_DOC_EMPTY = "没有找到话术：目录要用 ## 开头，每条话术的标题用 **标题**";

function signature(item: Pick<SecretItem, "kind" | "label" | "secret">) {
  return `${item.kind || "secret"}\u0000${item.label}\u0000${item.secret}`;
}

// The same preview as a spreadsheet import, but the document's chapters become the folders, in the document's order.
export function buildSnippetDocImportPreview(markdown: string, current: SecretItem[], createId: () => string, now: number): SnippetImportPreview {
  const { folders, items: entries } = parseSnippetDocument(markdown);
  if (!entries.length) throw new Error(SNIPPET_DOC_EMPTY);
  const signatures = new Set(current.map(signature));
  const items: SecretItem[] = [];
  let duplicateCount = 0;
  entries.forEach((entry, index) => {
    const snippetMeta: SnippetMeta = {
      stage: entry.folder,
      scene: entry.scene,
      action: entry.action,
      productGroups: productGroupsForRawProduct(""),
      rawProduct: "",
      chineseText: "",
      placeholders: extractPlaceholders(entry.secret),
      requiredInputs: [],
      usageNote: entry.usageNote,
      requiresVerification: false,
      sourceRow: index + 1,
    };
    const item: SecretItem = { id: "", label: entry.label, secret: entry.secret, note: "", color: "#ffcfa8", kind: "snippet", summary: entry.action, folder: entry.folder, pinned: false, snippetMeta, createdAt: now, updatedAt: now };
    const key = signature(item);
    if (signatures.has(key)) { duplicateCount += 1; return; }
    signatures.add(key);
    items.push({ ...item, id: createId() });
  });
  const used = new Set(items.map((item) => item.folder));
  return { totalCount: entries.length, importableCount: items.length, duplicateCount, errorCount: 0, errors: [], folders: folders.filter((name) => used.has(name)), items };
}
