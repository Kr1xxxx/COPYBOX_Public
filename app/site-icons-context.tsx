"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { hostnameOf, detectSite } from "./site-core";
import { SITE_ICONS } from "./site-icons";
import { isIconData, needsFetch, readSiteIcons, writeSiteIcons, type SiteIconMap } from "./site-icon-store";
import { openSecretItemsStore } from "./secret-items-store";

// Real website icons for the 保险箱. Each site is asked once (the site itself, through the app), the answer is kept encrypted
// on this device, and nothing is fetched again. No icon found or offline: the coloured initial stays.
type Ctx = { icons: SiteIconMap; scan: () => void };
const SiteIconsContext = createContext<Ctx>({ icons: {}, scan: () => undefined });

export function useSiteIcon(key: string | undefined) {
  const { icons } = useContext(SiteIconsContext);
  return key ? icons[key]?.data || "" : "";
}

export function useSiteIconScan() {
  return useContext(SiteIconsContext).scan;
}

export function SiteIconsProvider({ deviceKey, children }: { deviceKey: string; children: ReactNode }) {
  const [icons, setIcons] = useState<SiteIconMap>({});
  const mapRef = useRef<SiteIconMap>({});
  const busy = useRef(false);
  const again = useRef(false);

  const scan = useCallback(() => {
    const fetchIcon = window.clipboxDesktop?.fetchSiteIcon;
    if (!fetchIcon) return;
    if (busy.current) { again.current = true; return; }
    busy.current = true;
    void (async () => {
      try {
        do {
          again.current = false;
          const items = await openSecretItemsStore(deviceKey).list();
          const wanted = new Map<string, string>();
          for (const item of items) {
            if (item.type !== "login" || !item.url) continue;
            const host = hostnameOf(item.url);
            const site = detectSite({ url: item.url });
            if (host && !SITE_ICONS[site.key] && needsFetch(mapRef.current, site.key, Date.now())) wanted.set(site.key, host);
          }
          for (const [key, host] of wanted) {
            let data = "";
            try { data = await fetchIcon(host); } catch { data = ""; }
            mapRef.current = { ...mapRef.current, [key]: { data: isIconData(data) ? data : "", at: Date.now() } };
            await writeSiteIcons(deviceKey, mapRef.current);
            setIcons(mapRef.current);
          }
        } while (again.current);
      } catch {
        // Icons are a nicety; a failure here must never disturb the 保险箱.
      } finally {
        busy.current = false;
      }
    })();
  }, [deviceKey]);

  useEffect(() => {
    let live = true;
    void readSiteIcons(deviceKey).then((map) => {
      if (!live) return;
      mapRef.current = map;
      setIcons(map);
      scan();
    });
    return () => { live = false; };
  }, [deviceKey, scan]);

  return <SiteIconsContext.Provider value={{ icons, scan }}>{children}</SiteIconsContext.Provider>;
}
