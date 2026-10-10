import type { Site } from "./site-core";
import { SITE_ICONS } from "./site-icons";
import { useSiteIcon } from "./site-icons-context";

// A hex like "#f5f5f5" is light enough that a white glyph would vanish.
function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 200;
}

// The round badge in front of a site: the brand glyph when we ship one, otherwise its colour and initial.
// Everything is bundled with the app: no network, nothing leaves the device.
export function SiteBadge({ site, size = 28 }: { site: Pick<Site, "color" | "letter" | "name"> & { key?: string }; size?: number }) {
  const icon = site.key ? SITE_ICONS[site.key] : undefined;
  const fetched = useSiteIcon(site.key);
  if (!icon && fetched) {
    return (
      <span className="site-badge site-badge-fetched" style={{ width: size, height: size }} role="img" aria-label={site.name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fetched} alt="" width={Math.round(size * 0.72)} height={Math.round(size * 0.72)} draggable={false} />
      </span>
    );
  }
  if (icon) {
    return (
      <span className="site-badge" style={{ width: size, height: size, background: icon.hex }} role="img" aria-label={site.name}>
        <svg viewBox="0 0 24 24" width={Math.round(size * 0.58)} height={Math.round(size * 0.58)} aria-hidden="true" fill={isLight(icon.hex) ? "#222" : "#fff"}><path d={icon.path} /></svg>
      </span>
    );
  }
  return (
    <span className="site-badge" style={{ width: size, height: size, background: site.color, fontSize: Math.round(size * 0.46) }} role="img" aria-label={site.name}>
      {site.letter}
    </span>
  );
}
