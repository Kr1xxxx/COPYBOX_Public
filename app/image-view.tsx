"use client";

// The 宫格 | 列表 switch for the 图片 section and the hook that remembers the choice on this device.

import { useState } from "react";
import { ArcSegmented } from "./arc/segmented";
import { readImageView, writeImageView, type ImageView } from "./image-view-core";

export function useImageView(): [ImageView, (view: ImageView) => void] {
  // Read when the page first runs in the browser; the 图片 section is never part of the first server render.
  const [view, setView] = useState<ImageView>(() => readImageView());
  return [view, (next) => { setView(next); writeImageView(next); }];
}

const iconProps = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;

export function ImageViewSwitch({ view, onChange }: { view: ImageView; onChange: (view: ImageView) => void }) {
  return (
    <ArcSegmented
      className="settings-segment image-view-switch"
      label="图片显示方式"
      value={view}
      onSelect={(next) => onChange(next as ImageView)}
      options={[
        { value: "grid", ariaLabel: "宫格视图", title: "宫格", label: <svg {...iconProps}><rect x="4" y="4" width="6" height="6" rx="1.4" /><rect x="14" y="4" width="6" height="6" rx="1.4" /><rect x="4" y="14" width="6" height="6" rx="1.4" /><rect x="14" y="14" width="6" height="6" rx="1.4" /></svg> },
        { value: "list", ariaLabel: "列表视图", title: "列表", label: <svg {...iconProps}><path d="M9 7h11M9 12h11M9 17h11" /><circle cx="4.8" cy="7" r=".6" /><circle cx="4.8" cy="12" r=".6" /><circle cx="4.8" cy="17" r=".6" /></svg> },
      ]}
    />
  );
}
