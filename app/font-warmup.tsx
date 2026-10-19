"use client";

import { useEffect } from "react";

// The popup fonts (globals.css @font-face) load only when a popup first uses them, so the first popup showed its text
// in a fallback font and then jumped to the real one (owner 2026-10-19). Load them once at start instead.
export function FontWarmup() {
  useEffect(() => {
    const faces = ["400 1em Poppins", "500 1em Poppins", "600 1em Poppins", "400 1em Lora", "600 1em Lora"];
    // MiSans is the Chinese popup font everywhere except macOS, which uses PingFang (--brand-cjk).
    if (!document.documentElement.classList.contains("platform-darwin")) faces.push("400 1em MiSans", "600 1em MiSans");
    for (const face of faces) document.fonts?.load(face, "Aa中").catch(() => {});
  }, []);
  return null;
}
