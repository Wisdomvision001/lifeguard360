import type { EmergencyCategoryId, OfflinePackageMeta } from "@/types";

/**
 * OfflineContentService (Phase 4): device-local offline content cache.
 *
 * Stores the approved first-aid package in localStorage under a dedicated
 * namespace. Truthfulness rules:
 * - The service itself is account-agnostic: it caches content for whichever
 *   user saves it. Account gating happens at the route/navigation layer.
 * - "Available offline" means the cached content — never communications.
 */

const STORAGE_KEY = "lifeguard360.offlinePackage.v1";
const GUIDE_VERSIONS_KEY = "lifeguard360.offlineGuideVersions.v1";

export function isOfflinePackageAvailable(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function getOfflinePackageMeta(): OfflinePackageMeta | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as OfflinePackageMeta;
    if (!Array.isArray(parsed.categories) || typeof parsed.version !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveOfflinePackage(
  categories: EmergencyCategoryId[],
  contentVersion: string,
): OfflinePackageMeta {
  const meta: OfflinePackageMeta = {
    version: contentVersion,
    downloadedAt: new Date().toISOString(),
    categories,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
    const versions: Record<string, string> = {};
    for (const category of categories) versions[category] = contentVersion;
    window.localStorage.setItem(GUIDE_VERSIONS_KEY, JSON.stringify(versions));
    return meta;
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === "QuotaExceededError"
        ? "Not enough storage space on this device to save the offline package."
        : "Could not save the offline package on this device.",
      { cause: error },
    );
  }
}

export function removeOfflinePackage(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(GUIDE_VERSIONS_KEY);
  } catch {
    // Nothing to do; absence is the desired state.
  }
}

/** Version comparison for the "update available" indicator. */
export function isUpdateAvailable(meta: OfflinePackageMeta, currentVersion: string): boolean {
  return meta.version !== currentVersion;
}

export const OFFLINE_PACKAGE_STORAGE_KEY = STORAGE_KEY;
