import { createContext, useContext, useMemo, useState, type JSX, type ReactNode } from "react";

import type { OfflinePackageMeta } from "@/types";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  getOfflinePackageMeta,
  removeOfflinePackage,
} from "@/services/offline/offlineContentService";
import { CONTENT_VERSION } from "@/data/firstAid";

/**
 * OfflineProvider (Phase 4): exposes the downloaded-package state and the
 * honest online/offline flag. Download/refresh actions live in the page;
 * this provider centralises state so the indicator stays consistent.
 */

interface OfflineContextValue {
  online: boolean;
  meta: OfflinePackageMeta | null;
  updateAvailable: boolean;
  refreshMeta: () => void;
  clearPackage: () => void;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function OfflineProvider({ children }: { children: ReactNode }): JSX.Element {
  const online = useOnlineStatus();
  // Read localStorage lazily at first render instead of a mount effect —
  // no cascading render, and the initial state is correct immediately.
  const [meta, setMeta] = useState<OfflinePackageMeta | null>(() => getOfflinePackageMeta());

  const refreshMeta = (): void => setMeta(getOfflinePackageMeta());

  const value = useMemo<OfflineContextValue>(
    () => ({
      online,
      meta,
      updateAvailable: meta !== null && meta.version !== CONTENT_VERSION,
      refreshMeta,
      clearPackage: () => {
        removeOfflinePackage();
        setMeta(null);
      },
    }),
    [online, meta],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineContextValue {
  const context = useContext(OfflineContext);
  if (context === null) throw new Error("useOffline must be used within OfflineProvider");
  return context;
}
