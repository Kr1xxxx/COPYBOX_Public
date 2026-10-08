import {
  mergeImportedVaultData,
  normalizeVaultData,
  type BackupScope,
  type ImportStrategy,
  type ItemKind,
  type VaultData,
} from "./clipbox-core.ts";

export type ClipboxEdition = "full" | "snippet-only";

export type ClipboxCapabilities = {
  edition: ClipboxEdition;
  platform: "browser" | "darwin" | "win32";
  supportsSecrets: boolean;
  supportsExport: boolean;
  supportsAutomation: boolean;
  globalShortcut: string;
};

export const FULL_CAPABILITIES: ClipboxCapabilities = {
  edition: "full",
  platform: "browser",
  supportsSecrets: true,
  supportsExport: true,
  supportsAutomation: true,
  globalShortcut: "",
};

type CapabilityResolution =
  | { ok: true; capabilities: ClipboxCapabilities }
  | { ok: false; error: string };

const WINDOWS_SECURITY_ERROR = "Clipbox Windows 安全组件未能加载，请重新安装应用。";

function isCapabilities(value: unknown): value is ClipboxCapabilities {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ClipboxCapabilities>;
  return (candidate.edition === "full" || candidate.edition === "snippet-only")
    && (candidate.platform === "browser" || candidate.platform === "darwin" || candidate.platform === "win32")
    && typeof candidate.supportsSecrets === "boolean"
    && typeof candidate.supportsExport === "boolean"
    && typeof candidate.supportsAutomation === "boolean"
    && typeof candidate.globalShortcut === "string";
}

export function resolveRuntimeCapabilities(
  locationProtocol: string,
  bridgeCapabilities: unknown,
  windowsDesktopMarker = false,
): CapabilityResolution {
  if (windowsDesktopMarker) {
    if (!isCapabilities(bridgeCapabilities)
      || bridgeCapabilities.platform !== "win32"
      || bridgeCapabilities.edition !== "snippet-only"
      || bridgeCapabilities.supportsSecrets
      || bridgeCapabilities.supportsExport
      || bridgeCapabilities.supportsAutomation) {
      return { ok: false, error: WINDOWS_SECURITY_ERROR };
    }
    return { ok: true, capabilities: bridgeCapabilities };
  }

  if (bridgeCapabilities === undefined) return { ok: true, capabilities: FULL_CAPABILITIES };
  if (!isCapabilities(bridgeCapabilities)) return { ok: false, error: "Clipbox 桌面组件未能加载，请重新打开应用。" };
  return { ok: true, capabilities: bridgeCapabilities };
}

export function legacyVaultActionForEdition(edition: ClipboxEdition): "remove" | "preserve" {
  return edition === "snippet-only" ? "remove" : "preserve";
}

export function viewPolicyForEdition(edition: ClipboxEdition): {
  defaultKind: ItemKind;
  showKindSwitcher: boolean;
  showExport: boolean;
  sidebarTitle: string;
} {
  return edition === "snippet-only"
    ? { defaultKind: "snippet", showKindSwitcher: false, showExport: false, sidebarTitle: "话术库" }
    : { defaultKind: "secret", showKindSwitcher: true, showExport: true, sidebarTitle: "" };
}

export function filterVaultForEdition(data: VaultData, edition: ClipboxEdition) {
  const normalized = normalizeVaultData(data);
  if (edition === "full") return { data: normalized, skippedSecretCount: 0, requiresRewrite: false };

  const items = normalized.items.filter((item) => item.kind === "snippet");
  const skippedSecretCount = normalized.items.length - items.length;
  return {
    data: normalizeVaultData({
      items,
      folders: { secret: [], snippet: normalized.folders.snippet },
      nextSnippetNumber: normalized.nextSnippetNumber,
    }),
    skippedSecretCount,
    requiresRewrite: skippedSecretCount > 0 || normalized.folders.secret.length > 0,
  };
}

export function prepareImportForEdition(
  current: VaultData,
  incoming: VaultData,
  strategy: ImportStrategy,
  edition: ClipboxEdition,
  createId: () => string,
  scope?: BackupScope,
) {
  const safeCurrent = filterVaultForEdition(current, edition).data;
  if (edition === "snippet-only" && scope === "secret") {
    return {
      data: safeCurrent,
      importedCount: 0,
      skippedSecretCount: normalizeVaultData(incoming).items.length,
      shouldPersist: false,
    };
  }
  const filteredIncoming = filterVaultForEdition(incoming, edition);
  if (edition === "snippet-only" && filteredIncoming.data.items.length === 0) {
    return {
      data: safeCurrent,
      importedCount: 0,
      skippedSecretCount: filteredIncoming.skippedSecretCount,
      shouldPersist: false,
    };
  }

  const merged = mergeImportedVaultData(safeCurrent, filteredIncoming.data, strategy, createId, scope);
  return { ...merged, skippedSecretCount: filteredIncoming.skippedSecretCount, shouldPersist: true };
}
