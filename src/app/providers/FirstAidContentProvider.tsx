import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { applyPublishedGuides } from "@/services/firstAid/firstAidService";
import { fetchPublishedGuides } from "@/services/firstAid/firstAidBackend";
import { isFirebaseConfigured } from "@/services/firebase/client";

/**
 * FirstAidContentProvider — refreshes the merged guide store from Firestore.
 *
 * Behaviour (Phase 6 fallback architecture):
 *   - On mount, when Firebase is configured, fetch the published guides once.
 *     Validated documents replace the overlay for their categories; every
 *     other category keeps the bundled fallback.
 *   - When Firebase is not configured (CI, fresh clone, offline), or the
 *     fetch FAILS, the bundled dataset stays served untouched. No error is
 *     shown to the public because the content on screen remains valid — but
 *     the source state stays honestly at "bundled"; a failed refresh never
 *     reports "published".
 *   - A successful refresh bumps `revision` so the subtree re-renders and
 *     pages that read synchronously via getAllGuides()/getGuide() pick up
 *     the published content.
 *
 * refresh() is stable and exposed for admin flows (after publish, the editor
 * refreshes so what it shows matches what the public will see).
 */

export type FirstAidContentSource = "bundled" | "published";

interface FirstAidContentContextValue {
  /** Where the currently rendered guide content came from. */
  source: FirstAidContentSource;
  /** Increments on every successful refresh (drives re-render). */
  revision: number;
  /** Re-fetch published content; failures leave current content untouched. */
  refresh: () => Promise<void>;
}

const FirstAidContentContext = createContext<FirstAidContentContextValue | null>(null);

interface FirstAidContentProviderProps {
  children: ReactNode;
}

export function FirstAidContentProvider({ children }: FirstAidContentProviderProps) {
  const [state, setState] = useState<{ source: FirstAidContentSource; revision: number }>({
    source: "bundled",
    revision: 0,
  });

  const refresh = useCallback((): Promise<void> => {
    if (!isFirebaseConfigured()) return Promise.resolve();
    return fetchPublishedGuides()
      .then((guides) => {
        applyPublishedGuides(guides);
        // Honest source: "published" only when documents were actually read.
        setState((prev) => ({
          source: guides.length > 0 ? "published" : "bundled",
          revision: prev.revision + 1,
        }));
      })
      .catch(() => {
        // Backend unavailable: keep serving whatever is already loaded
        // (bundled fallback on first load; last-known published content
        // afterwards). Never mark a failed refresh as "published".
      });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ source: state.source, revision: state.revision, refresh }),
    [state, refresh],
  );

  return <FirstAidContentContext.Provider value={value}>{children}</FirstAidContentContext.Provider>;
}

/**
 * Read the content-source state. Components under the provider re-render on
 * refresh; consumers without an existing provider (isolated tests) get an
 * honest bundled-only value instead of a crash.
 */
export function useFirstAidContent(): FirstAidContentContextValue {
  const context = useContext(FirstAidContentContext);
  return context ?? { source: "bundled", revision: 0, refresh: noopRefresh };
}

/** No-op refresh for components rendered outside the provider (tests). */
async function noopRefresh(): Promise<void> {
  // Nothing to refresh: without the provider there is no content lifecycle.
}
