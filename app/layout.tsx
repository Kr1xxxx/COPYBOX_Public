import type { ReactNode } from "react";
import "./globals.css";
import { FontWarmup } from "./font-warmup";

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}<FontWarmup /></body>
    </html>
  );
}
