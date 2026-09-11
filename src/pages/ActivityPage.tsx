import { useEffect, useState, type JSX } from "react";
import { Link } from "react-router";

import { useAuth } from "@/app/providers/AuthProvider";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Icon, type IconName } from "@/components/icons";
import { listActivity } from "@/services/activity/activityService";
import { formatTimestamp } from "@/utils/format";
import type { ActivityRecord, ActivityType } from "@/types";
import styles from "@/pages/ActivityPage.module.css";

/**
 * Activity History (Phase 10): meaningful events only — data minimisation by
 * design. No page visits, no incidental UI interactions.
 */

const TYPE_LABELS: Record<ActivityType, string> = {
  contact_added: "Contact added",
  contact_updated: "Contact updated",
  contact_deleted: "Contact deleted",
  location_shared: "Location shared",
  emergency_action: "Emergency action",
  offline_download: "Offline package",
};

const TYPE_ICONS: Record<ActivityType, IconName> = {
  contact_added: "contacts",
  contact_updated: "contacts",
  contact_deleted: "contacts",
  location_shared: "map-pin",
  emergency_action: "sos",
  offline_download: "download",
};

function describeActivity(record: ActivityRecord): string {
  const detail = record.detail;
  switch (record.type) {
    case "contact_added":
      return detail.relationship !== undefined
        ? `A new ${String(detail.relationship)} contact was added.`
        : "A new emergency contact was added.";
    case "contact_updated":
      return "An emergency contact was updated.";
    case "contact_deleted":
      return "An emergency contact was removed.";
    case "location_shared": {
      const via = detail.via === "sms" ? "via emergency SMS" : "from Get Help Now";
      return `Your location was shared ${via}.`;
    }
    case "emergency_action":
      return detail.action === "sms_prepared"
        ? "An emergency SMS was prepared for a trusted contact."
        : detail.action === "call_initiated"
          ? "A call to a trusted contact was started from your device."
          : "An emergency assistance action was performed.";
    case "offline_download":
      return `Offline first-aid package v${String(detail.version ?? "")} was saved on this device.`;
    default:
      return "Activity recorded.";
  }
}

export function ActivityPage(): JSX.Element {
  const { authState } = useAuth();
  const uid = authState.status === "signed-in" ? (authState.user?.uid ?? null) : null;

  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (uid === null) return;
    let cancelled = false;
    listActivity(uid)
      .then((loaded) => {
        if (!cancelled) setRecords(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load activity.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Activity History</h1>
        <p>
          Meaningful events from your use of Lifeguard360 — contacts you manage, emergency
          assistance actions, and offline downloads. Nothing else is recorded.
        </p>
      </header>

      {loading && (
        <Card>
          <p aria-busy="true">Loading your activity…</p>
        </Card>
      )}

      {error !== null && (
        <Card title="Activity unavailable" titleIcon="alert">
          <p role="alert">{error}</p>
        </Card>
      )}

      {!loading && error === null && records.length === 0 && (
        <Card title="No activity yet" titleIcon="history">
          <p>
            Actions like adding a contact, sharing your location, or downloading the offline package
            will appear here. <Link to="/get-help">Try Get Help Now</Link>.
          </p>
        </Card>
      )}

      {records.length > 0 && (
        <ol className={styles.timeline}>
          {records.map((record) => (
            <li key={record.id} className={styles.item}>
              <span className={styles.itemIcon} aria-hidden="true">
                <Icon name={TYPE_ICONS[record.type]} size={18} />
              </span>
              <div className={styles.itemBody}>
                <p className={styles.itemLabel}>{describeActivity(record)}</p>
                <p className={styles.itemTime}>
                  <Badge tone="neutral">{TYPE_LABELS[record.type]}</Badge>
                  <span>· {formatTimestamp(record.createdAt)}</span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
