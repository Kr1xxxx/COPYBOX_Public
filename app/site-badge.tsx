import type { Site } from "./site-core";

// The round badge in front of a site: its colour and initial (no network, nothing leaves the device).
export function SiteBadge({ site, size = 28 }: { site: Pick<Site, "color" | "letter" | "name">; size?: number }) {
  return (
    <span className="site-badge" style={{ width: size, height: size, background: site.color, fontSize: Math.round(size * 0.46) }} role="img" aria-label={site.name}>
      {site.letter}
    </span>
  );
}
