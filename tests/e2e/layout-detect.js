(() => {
  const out = [];
  // checkVisibility: the rows inside a closed <details> still report a box in Chromium but are not drawn.
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.05 && e.checkVisibility() !== false; };
  const name = (e) => { const c = (e.className && e.className.baseVal === undefined ? e.className : "").toString().trim().split(/\s+/).slice(0, 2).join("."); const t = (e.getAttribute("aria-label") || e.placeholder || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24); return `${e.tagName.toLowerCase()}${c ? "." + c : ""}「${t}」`; };
  const topmost = (e) => { const r = e.getBoundingClientRect(); const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)); const h = document.elementFromPoint(x, y); return h && (h === e || e.contains(h) || h.contains(e)); };
  const overlayOf = (e) => e.closest("[role=menu],[role=listbox],[role=dialog],[role=alertdialog],.dropdown,.var-popup,.toast,.toast-line,.tooltip,.popover");
  const stickyOf = (e) => { for (let a = e; a && a !== document.body; a = a.parentElement) { const ps = getComputedStyle(a).position; if (ps === "sticky" || ps === "fixed") return a; } return null; };
  const all = [...document.querySelectorAll("body *")].filter((e) => !(e instanceof SVGElement && e.tagName !== "svg") && vis(e));
  const ring = (s) => { let pad = 0; for (const part of (s.boxShadow || "none").split(/,(?![^(]*\))/)) { if (part.includes("inset") || part === "none") continue; const nums = (part.replace(/rgba?\([^)]*\)|#[0-9a-f]+|[a-z-]+\([^)]*\)/gi, "").match(/-?[\d.]+px/g) || []).map(parseFloat); if (nums.length >= 3) { const [x, y, blur, spread = 0] = nums; if (blur <= 1) pad = Math.max(pad, spread + Math.max(Math.abs(x), Math.abs(y))); } } if (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) pad = Math.max(pad, parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset || 0)); return pad; };
  // 1) clipped borders / rings / controls
  for (const e of all) {
    const s = getComputedStyle(e);
    const bordered = ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(e.tagName) || parseFloat(s.borderTopWidth) + parseFloat(s.borderRightWidth) > 0 || ring(s) > 0;
    if (!bordered) continue;
    const r = e.getBoundingClientRect(); const p = ring(s);
    const box = { l: r.left - p, t: r.top - p, r: r.right + p, b: r.bottom + p };
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      const as = getComputedStyle(a); const ox = as.overflowX, oy = as.overflowY;
      if (ox === "visible" && oy === "visible") continue;
      const ar = a.getBoundingClientRect(); const cl = { l: ar.left + a.clientLeft, t: ar.top + a.clientTop, r: ar.left + a.clientLeft + a.clientWidth, b: ar.top + a.clientTop + a.clientHeight };
      if (box.r < cl.l || box.l > cl.r || box.b < cl.t || box.t > cl.b) break; // fully scrolled out
      const scroll = (o) => o === "auto" || o === "scroll";
      const cut = [];
      if (box.l < cl.l - 0.5 && !(scroll(ox) && a.scrollLeft > 0)) cut.push(`左 ${Math.round(cl.l - box.l)}px`);
      if (box.r > cl.r + 0.5 && !scroll(ox)) cut.push(`右 ${Math.round(box.r - cl.r)}px`);
      if (!scroll(oy)) { if (box.t < cl.t - 0.5) cut.push(`上 ${Math.round(cl.t - box.t)}px`); if (box.b > cl.b + 0.5) cut.push(`下 ${Math.round(box.b - cl.b)}px`); }
      else if (scroll(ox) && box.r > cl.r + 0.5) cut.push(`右 ${Math.round(box.r - cl.r)}px(滚动区)`);
      if (cut.length) out.push({ type: "邊框或焦點框被裁", el: name(e), by: name(a), detail: cut.join(" ") + (p ? `（含焦點框 ${p}px）` : "") });
      break;
    }
  }
  // 2) text cut
  const ctx = document.createElement("canvas").getContext("2d");
  for (const e of all) {
    const s = getComputedStyle(e);
    if ((e.tagName === "INPUT" || e.tagName === "TEXTAREA") && e.placeholder && !e.value && e.type !== "checkbox") {
      ctx.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const w = ctx.measureText(e.placeholder).width; const avail = e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
      if (e.tagName === "INPUT" && w > avail + 1) out.push({ type: "提示文字被截斷", el: name(e), detail: `需要 ${Math.round(w)}px，只有 ${Math.round(avail)}px` });
      continue;
    }
    const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    if (e.scrollWidth > e.clientWidth + 1 && (s.overflowX === "hidden" || s.overflowX === "clip")) out.push({ type: s.textOverflow === "ellipsis" ? "文字省略(…)" : "文字被硬切", el: name(e), detail: `${e.scrollWidth}>${e.clientWidth}` });
    if (e.scrollHeight > e.clientHeight + 2 && (s.overflowY === "hidden" || s.overflowY === "clip") && !s.webkitLineClamp?.match(/\d/) && s.whiteSpace !== "nowrap") out.push({ type: "文字下方被切", el: name(e), detail: `${e.scrollHeight}>${e.clientHeight}` });
  }
  // 3) out of window
  for (const e of all) {
    const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    if (!(s.position === "fixed" || e.matches("[role=menu],[role=listbox],[role=dialog],.dropdown,.var-popup,.toast,.popover"))) continue;
    if (r.width < 8 || r.height < 8) continue;
    if (r.right > innerWidth + 0.5 || r.left < -0.5 || r.bottom > innerHeight + 0.5 || r.top < -0.5) if (topmost(e)) out.push({ type: "超出視窗", el: name(e), detail: `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)} 視窗 ${innerWidth}x${innerHeight}` });
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push({ type: "整頁橫向滾動", el: "html", detail: `${document.documentElement.scrollWidth}>${innerWidth}` });
  // 4) overlap of visible controls / text
  // visible rect of an element after clipping by scrolling/hidden ancestors (content scrolled under a header is not "overlap")
  const clipped = (e) => { const r = e.getBoundingClientRect(); let l = r.left, t = r.top, rt = r.right, b = r.bottom; for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const as = getComputedStyle(a); if (as.overflowX === "visible" && as.overflowY === "visible") continue; const ar = a.getBoundingClientRect(); if (as.overflowX !== "visible") { l = Math.max(l, ar.left); rt = Math.min(rt, ar.right); } if (as.overflowY !== "visible") { t = Math.max(t, ar.top); b = Math.min(b, ar.bottom); } } return rt > l && b > t ? { left: l, top: t, right: rt, bottom: b } : null; };
  const leaves = all.filter((e) => getComputedStyle(e).display !== "inline" && (["BUTTON", "INPUT", "A", "LABEL", "TEXTAREA"].includes(e.tagName) || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) && topmost(e));
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i], b = leaves[j]; if (a.contains(b) || b.contains(a)) continue;
    if (overlayOf(a) !== overlayOf(b)) continue;
    if (stickyOf(a) !== stickyOf(b)) continue;
    const ra = clipped(a), rb = clipped(b); if (!ra || !rb) continue;
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (w > 3 && h > 3) out.push({ type: "元素重疊", el: name(a), by: name(b), detail: `${Math.round(w)}x${Math.round(h)}px` });
  }
  // 5) contrast
  const parse = (c) => { const m = c.match(/[\d.]+/g); if (!m) return [0, 0, 0, 0]; const v = m.map(Number); if (c.startsWith("color(")) return [v[0] * 255, v[1] * 255, v[2] * 255, v[3] ?? 1]; if (c.startsWith("oklab") || c.startsWith("oklch") || c.startsWith("lab")) return null; return v; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  for (const e of leaves) {
    const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); if (!hasText) continue;
    const s = getComputedStyle(e); const fg = parse(s.color); if (!fg) continue; if (fg[3] !== undefined && fg[3] < 0.2) continue;
    let bg = null; for (let a = e; a; a = a.parentElement) { const as2 = getComputedStyle(a); const c = parse(as2.backgroundColor); if (!c || as2.backgroundImage !== "none" || (as2.backdropFilter && as2.backdropFilter !== "none")) { bg = null; break; } if ((c[3] ?? 1) > 0.9) { bg = c; break; } }
    if (!bg) continue;
    const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const big = parseFloat(s.fontSize) >= 18 || (parseFloat(s.fontSize) >= 14 && +s.fontWeight >= 700);
    if (ratio < (big ? 2.5 : 3)) out.push({ type: "對比太低看不清", el: name(e), detail: `對比 ${ratio.toFixed(2)}，字色 ${s.color}，底色 rgb(${bg.slice(0, 3).join(",")})` });
  }
  return out;
})()
