import { useState, type JSX } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useOffline } from "@/app/providers/OfflineProvider";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { getAllGuides } from "@/services/firstAid/firstAidService";
import { saveOfflinePackage } from "@/services/offline/offlineContentService";
import { logActivity } from "@/services/activity/activityService";
import { formatTimestamp } from "@/utils/format";
import { CONTENT_VERSION } from "@/data/firstAid";
import styles from "@/pages/OfflineFirstAidPage.module.css";

/**
 * Offline First Aid (Phase 4): registered users only. Downloads the approved
 * first-aid package to this device. Truthfulness: offline access covers
 * first-aid content only — never communications, and "downloaded" is
 * version-aware so the update indicator stays honest.
 */
export function OfflineFirstAidPage(): JSX.Element {
  const { authState } = useAuth();
  const uid = authState.status === "signed-in" ? (authState.user?.uid ?? null) : null;
  const { online, meta, updateAvailable, refreshMeta, clearPackage } = useOffline();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = (): void => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const categories = getAllGuides().map((guide) => guide.id);
      saveOfflinePackage(categories, CONTENT_VERSION);
      refreshMeta();
      setMessage("Offline first-aid package saved on this device.");
      if (uid !== null) {
        void logActivity(uid, "offline_download", { version: CONTENT_VERSION });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the offline package.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = (): void => {
    clearPackage();
    setMessage("Offline package removed from this device.");
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Offline First Aid</h1>
        <p>
          Registered users can save the approved first-aid guides on this device so they remain
          available without an internet connection.
        </p>
      </header>

      {!online && (
        <Card title="You are offline" titleIcon="offline">
          <p>
            You can still read any first-aid content already saved on this device. Downloading or
            updating the package requires a connection.
          </p>
        </Card>
      )}

      <Card title="Package status" titleIcon="download">
        {meta === null ? (
          <div className={styles.statusRow}>
            <Badge tone="neutral">Not downloaded</Badge>
            <p>
              The first-aid package is not saved on this device. Guides are still readable while
              online.
            </p>
          </div>
        ) : (
          <div className={styles.statusRow}>
            <Badge tone={updateAvailable ? "amber" : "success"} dot>
              {updateAvailable ? "Update available" : "Up to date"}
            </Badge>
            <p>
              Version {meta.version} · saved {formatTimestamp(meta.downloadedAt)} ·{" "}
              {meta.categories.length} guides
            </p>
          </div>
        )}

        {updateAvailable && meta !== null && (
          <p className={styles.updateNote}>
            A newer content version ({CONTENT_VERSION}) is available. Refresh the package to stay
            current.
          </p>
        )}

        <div className={styles.actions}>
          <Button icon="download" disabled={busy || !online} onClick={handleDownload}>
            {meta === null ? "Download offline package" : "Refresh package"}
          </Button>
          {meta !== null && (
            <Button variant="outline" icon="close" disabled={busy} onClick={handleRemove}>
              Remove package
            </Button>
          )}
        </div>

        {!online && meta === null && (
          <p className={styles.offlineHint}>
            Connect to the internet to download the package for the first time.
          </p>
        )}
      </Card>

      <Card title="What works offline" titleIcon="check">
        <ul className={styles.capabilityList}>
          <li>Reading saved first-aid guides, steps, dos and don'ts</li>
          <li>Text-to-speech playback of saved guides (browser permitting)</li>
          <li>Acquiring your GPS location (permission still applies)</li>
          <li>Opening your device dialer or messaging app</li>
        </ul>
      </Card>

      <Card title="What does NOT work offline" titleIcon="alert">
        <ul className={styles.limitList}>
          <li>Saving new emergency contacts or editing your profile</li>
          <li>Sending anything — prepared SMS still requires your mobile network</li>
          <li>Facility discovery and map links</li>
          <li>Activity history synchronisation</li>
        </ul>
        <p className={styles.truthNote}>
          Your messaging app sending an SMS offline will queue it as your device decides;
          Lifeguard360 cannot confirm sending or delivery and will never claim to.
        </p>
      </Card>

      {message !== null && (
        <p className={styles.notice} role="status" aria-live="polite">
          {message}
        </p>
      )}
      {error !== null && (
        <p className={styles.errorNote} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
