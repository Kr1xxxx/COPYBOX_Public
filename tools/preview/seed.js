// Preview-only: generates ten pictures of different sizes and stores them through the app's own image store.
import { openImageStore } from "./image-store.js";

const SPECS = [
  { title: "微信收款码", w: 600, h: 600, type: "image/png", kind: "qr", folder: "收款码", hue: 150 },
  { title: "价目表长图", w: 900, h: 2400, type: "image/png", kind: "list", folder: "价目表", hue: 28 },
  { title: "产品主图", w: 1200, h: 1200, type: "image/jpeg", kind: "photo", folder: "产品图", hue: 330 },
  { title: "活动横幅", w: 1920, h: 480, type: "image/webp", kind: "photo", folder: "产品图", hue: 200 },
  { title: "手机聊天截图", w: 1080, h: 2340, type: "image/png", kind: "chat", folder: null, hue: 210 },
  { title: "小图标", w: 128, h: 128, type: "image/png", kind: "flat", folder: null, hue: 45 },
  { title: "宽屏截图", w: 1920, h: 1080, type: "image/jpeg", kind: "photo", folder: "物流单据", hue: 270 },
  { title: "A4 证书", w: 2480, h: 3508, type: "image/png", kind: "page", folder: "价目表", hue: 20 },
  { title: "大方图", w: 3000, h: 3000, type: "image/jpeg", kind: "photo", folder: "产品图", hue: 95 },
  { title: "极窄长图", w: 300, h: 3000, type: "image/png", kind: "stripes", folder: "物流单据", hue: 0 },
];
export const TEST_TITLES = SPECS.map((spec) => spec.title);
const FOLDERS = ["收款码", "价目表", "产品图", "物流单据"];

function hsl(h, s, l) { return `hsl(${h % 360} ${s}% ${l}%)`; }

function draw(spec) {
  const canvas = document.createElement("canvas");
  canvas.width = spec.w; canvas.height = spec.h;
  const g = canvas.getContext("2d");
  const m = Math.min(spec.w, spec.h), u = m / 100;
  const font = (px, weight = 600) => `${weight} ${Math.round(px)}px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif`;
  const label = (text, x, y, px, color, align = "center", weight = 600) => { g.font = font(px, weight); g.fillStyle = color; g.textAlign = align; g.textBaseline = "middle"; g.fillText(text, x, y); };
  const caption = (dark) => {
    label(spec.title, spec.w / 2, spec.h * 0.46, Math.min(spec.w * 0.14, m * 0.12), dark ? "#fff" : "#2b2a27");
    label(`${spec.w} × ${spec.h}`, spec.w / 2, spec.h * 0.46 + Math.min(spec.w * 0.14, m * 0.12) * 1.1, Math.min(spec.w * 0.08, m * 0.07), dark ? "rgba(255,255,255,.85)" : "#6b665e", "center", 500);
  };
  if (spec.kind === "photo") {
    const grad = g.createLinearGradient(0, 0, spec.w, spec.h);
    grad.addColorStop(0, hsl(spec.hue, 70, 55)); grad.addColorStop(1, hsl(spec.hue + 50, 70, 35));
    g.fillStyle = grad; g.fillRect(0, 0, spec.w, spec.h);
    g.fillStyle = "rgba(255,255,255,.12)";
    for (let i = 0; i < 7; i += 1) { g.beginPath(); g.arc(spec.w * (0.1 + 0.15 * i), spec.h * (0.25 + 0.5 * ((i * 37) % 10) / 10), m * (0.1 + 0.03 * i), 0, Math.PI * 2); g.fill(); }
    caption(true);
  } else if (spec.kind === "qr") {
    g.fillStyle = hsl(spec.hue, 45, 90); g.fillRect(0, 0, spec.w, spec.h);
    const n = 29, cell = (m * 0.62) / n, ox = (spec.w - cell * n) / 2, oy = (spec.h - cell * n) / 2 - u * 3;
    g.fillStyle = "#fff"; g.fillRect(ox - cell * 2, oy - cell * 2, cell * (n + 4), cell * (n + 4));
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const finder = (cx, cy) => { g.fillStyle = "#111"; g.fillRect(ox + cx * cell, oy + cy * cell, cell * 7, cell * 7); g.fillStyle = "#fff"; g.fillRect(ox + (cx + 1) * cell, oy + (cy + 1) * cell, cell * 5, cell * 5); g.fillStyle = "#111"; g.fillRect(ox + (cx + 2) * cell, oy + (cy + 2) * cell, cell * 3, cell * 3); };
    g.fillStyle = "#111";
    for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) { const inFinder = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9); if (!inFinder && rnd() > 0.52) g.fillRect(ox + x * cell, oy + y * cell, cell, cell); }
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
    label("模拟收款码", spec.w / 2, spec.h - u * 8, u * 6, "#2b2a27"); label(`${spec.w} × ${spec.h}`, spec.w / 2, spec.h - u * 3, u * 3.4, "#6b665e", "center", 500);
  } else if (spec.kind === "list") {
    g.fillStyle = "#fffdf8"; g.fillRect(0, 0, spec.w, spec.h);
    g.fillStyle = hsl(spec.hue, 70, 48); g.fillRect(0, 0, spec.w, 200);
    label("2025 价目表", spec.w / 2, 100, 78, "#fff", "center", 700);
    for (let i = 0; i < 18; i += 1) {
      const y = 280 + i * 118; if (i % 2 === 0) { g.fillStyle = "#f6efe4"; g.fillRect(40, y - 52, spec.w - 80, 104); }
      label(`产品 ${String.fromCharCode(65 + i)}  ·  规格 ${10 + i * 2} mm`, 80, y, 40, "#2b2a27", "left", 500); label(`¥ ${(12 + i * 3.5).toFixed(2)}`, spec.w - 80, y, 42, hsl(spec.hue, 70, 38), "right", 700);
    }
    label(`${spec.w} × ${spec.h}`, spec.w / 2, spec.h - 70, 36, "#8a8478", "center", 500);
  } else if (spec.kind === "chat") {
    g.fillStyle = "#ece5dd"; g.fillRect(0, 0, spec.w, spec.h); g.fillStyle = "#075e54"; g.fillRect(0, 0, spec.w, 230);
    label("WhatsApp · 客户", 70, 150, 54, "#fff", "left", 700);
    const bubbles = [["Hi, is this still available?", 0], ["Yes! MOQ is 50 pcs.", 1], ["Can I get a sample first?", 0], ["Sure, sample fee is $20.", 1], ["Great, please send the price list.", 0], ["Sending now.", 1], ["Thank you!", 0]];
    bubbles.forEach(([text, mine], i) => { const y = 420 + i * 230, w = 640; const x = mine ? spec.w - w - 50 : 50; g.fillStyle = mine ? "#dcf8c6" : "#fff"; g.beginPath(); g.roundRect(x, y - 70, w, 140, 36); g.fill(); label(text, x + 36, y, 38, "#222", "left", 500); });
    label(`${spec.w} × ${spec.h}`, spec.w / 2, spec.h - 90, 40, "#6b665e", "center", 500);
  } else if (spec.kind === "page") {
    g.fillStyle = "#fff"; g.fillRect(0, 0, spec.w, spec.h); g.strokeStyle = hsl(spec.hue, 60, 45); g.lineWidth = 28; g.strokeRect(80, 80, spec.w - 160, spec.h - 160); g.lineWidth = 6; g.strokeRect(140, 140, spec.w - 280, spec.h - 280);
    label("证 书", spec.w / 2, 700, 260, hsl(spec.hue, 60, 38), "center", 700); label("Certificate of Quality", spec.w / 2, 960, 110, "#3b382f", "center", 500);
    for (let i = 0; i < 9; i += 1) { g.fillStyle = "#d9d4c8"; g.fillRect(380, 1320 + i * 150, spec.w - 760, 18); }
    label(`${spec.w} × ${spec.h}  (A4, 300dpi)`, spec.w / 2, spec.h - 330, 90, "#8a8478", "center", 500);
  } else if (spec.kind === "stripes") {
    const bands = 12; for (let i = 0; i < bands; i += 1) { g.fillStyle = hsl(i * 30, 65, 55); g.fillRect(0, (spec.h / bands) * i, spec.w, spec.h / bands + 1); }
    g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(30, spec.h / 2 - 190, spec.w - 60, 380);
    label("极窄长图", spec.w / 2, spec.h / 2 - 70, 54, "#2b2a27"); label(`${spec.w} × ${spec.h}`, spec.w / 2, spec.h / 2 + 50, 46, "#6b665e", "center", 500);
  } else {
    g.fillStyle = hsl(spec.hue, 90, 60); g.fillRect(0, 0, spec.w, spec.h); label("★", spec.w / 2, spec.h * 0.42, spec.h * 0.4, "#fff", "center", 700); label(`${spec.w}`, spec.w / 2, spec.h * 0.8, spec.h * 0.16, "#fff", "center", 600);
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), spec.type, 0.82));
}

// Adds every test picture that is not stored yet (matched by title). Returns how many were added.
export async function seedTestImages(deviceKey, onProgress = () => {}) {
  const store = await openImageStore(deviceKey);
  const have = new Set((await store.list()).map((meta) => meta.title));
  if (store.listFolders) { const existing = new Set((await store.listFolders()).map((folder) => folder.name)); for (const name of FOLDERS) if (!existing.has(name)) await store.createFolder(name); }
  let added = 0;
  for (const [index, spec] of SPECS.entries()) {
    if (have.has(spec.title)) continue;
    onProgress(index + 1, SPECS.length, spec.title);
    const blob = await draw(spec);
    await store.add(blob, spec.title, store.listFolders ? spec.folder : undefined);
    added += 1;
  }
  return added;
}
