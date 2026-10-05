import type { JSX } from "react";

import { Link } from "react-router";

import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import styles from "@/pages/admin/AdminAnalyticsPage.module.css";

/**
 * Admin Analytics.
 *
 * TRUTHFULNESS: Lifeguard360 records no analytics dataset — activity records
 * are purpose-bound user events, not analytics telemetry, and page-view
 * tracking was deliberately never added. So this page has no numbers to
 * show, and it will not invent any. It states that plainly, describes the
 * shape real analytics would need, and stays structurally ready for that
 * future dataset.
 */
export function AdminAnalyticsPage(): JSX.Element {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>Analytics</h1>
        <p>
          Usage insights for the Lifeguard360 platform — when a real dataset
          exists.
        </p>
      </header>

      <Card title="No analytics data yet" titleIcon="heart-pulse">
        <div className={styles.statusRow}>
          <Badge tone="neutral" dot>
            No analytics dataset
          </Badge>
          <Badge tone="amber" dot>
            Backend connection required
          </Badge>
        </div>
        <p className={styles.explanation}>
          Lifeguard360 does not currently collect analytics. The activity
          history the app records is a purpose-bound, minimal audit of real
          user actions — not telemetry — and no page-view or engagement
          tracking has ever been added. This page will not display invented
          numbers, so it is empty by design until a real analytics dataset is
          created in a future phase.
        </p>
        <p className={styles.explanation}>
          When analytics are introduced, they must be built from real,
          consented data collection with its own privacy review. The structure
          below shows what that data would need to provide.
        </p>
      </Card>

      <Card title="What real analytics will need" titleIcon="settings">
        <ul className={styles.requirementList}>
          <li>
            <strong>A data source</strong> — an agreed, privacy-reviewed set of
            events (for example emergency-tool usage) recorded server-side.
          </li>
          <li>
            <strong>Aggregation</strong> — a backend process that summarises
            events into counts and trends without exposing individuals.
          </li>
          <li>
            <strong>Read access for admins</strong> — Firestore rules permitting
            admin reads of the aggregated results only.
          </li>
          <li>
            <strong>Presentation</strong> — this page rendering those aggregate
            results; charts are only drawn from real values.
          </li>
        </ul>
      </Card>

      <p className={styles.relatedNote}>
        The activity records that do exist today are visible to each user in
        their own history; per-user activity is not readable by admins. See{" "}
        <Link to="/admin/activity">Activity Log</Link> for what is and is not
        available.
      </p>
    </div>
  );
}
