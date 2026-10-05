import type { JSX } from "react";

import { Link } from "react-router";

import { ACTIVITY_TYPES } from "@/types";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import styles from "@/pages/admin/AdminActivityLogPage.module.css";

/** Human-readable labels for the six real activity types. */
const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  contact_added: "Contact added",
  contact_updated: "Contact updated",
  contact_deleted: "Contact deleted",
  location_shared: "Location shared",
  emergency_action: "Emergency action",
  offline_download: "Offline package downloaded",
};

/**
 * Admin Activity Log.
 *
 * HONESTY: the application's activity architecture is per-user
 * (users/{uid}/activity) and owner-only by Firestore rules — admins cannot
 * read other users' activity, and no admin-level audit trail exists yet.
 * This page therefore shows no records and fabricates none. It explains
 * exactly why, lists the real event types the app does record, and names
 * what a real admin audit trail will require.
 */
export function AdminActivityLogPage(): JSX.Element {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>Activity Log</h1>
        <p>
          Administrative view of platform activity — when an admin-readable
          audit trail exists.
        </p>
      </header>

      <Card title="No admin-readable activity yet" titleIcon="history">
        <div className={styles.statusRow}>
          <Badge tone="neutral" dot>
            No records available
          </Badge>
          <Badge tone="amber" dot>
            Backend connection required
          </Badge>
        </div>
        <p className={styles.explanation}>
          The activity Lifeguard360 records is stored per user under that
          user's own account, and Firestore rules deliberately restrict it to
          the owner — administrators cannot read other people's activity, and
          this page will not pretend otherwise. No records are shown here
          because none are readable, not because none exist.
        </p>
        <p className={styles.explanation}>
          A genuine admin audit trail (administrative actions, content
          publishes, claim changes) does not exist yet either. It would need
          its own server-written collection with admin-only read rules, and is
          planned as part of the later Firebase phase — until then nothing is
          invented here.
        </p>
      </Card>

      <Card title="What the app records today (per user, owner-only)" titleIcon="check">
        <p className={styles.explanation}>
          Each signed-in user's own history can show these event types —
          visible only to that user:
        </p>
        <ul className={styles.typeList}>
          {ACTIVITY_TYPES.map((type) => (
            <li key={type}>
              <code>{type}</code>
              <span>{ACTIVITY_TYPE_LABELS[type] ?? type}</span>
            </li>
          ))}
        </ul>
        <p className={styles.explanation}>
          Unauthenticated development sessions keep a small device-local
          history instead; that is also outside any admin view. See{" "}
          <Link to="/admin/users">Users</Link> for what admins can read about
          accounts.
        </p>
      </Card>
    </div>
  );
}
