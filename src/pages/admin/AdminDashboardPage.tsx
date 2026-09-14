import { Link } from "react-router";
import type { JSX } from "react";

import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { Icon } from "@/components/icons";
import { getAllGuides } from "@/services/firstAid/firstAidService";
import { CONTENT_VERSION } from "@/data/firstAid";
import { CATEGORY_META } from "@/data/categoryMeta";
import styles from "@/pages/admin/AdminDashboardPage.module.css";

/**
 * Admin Dashboard (Phase 1 - Task 4).
 *
 * HONESTY CONTRACT: every value shown is derived from the running application
 * (bundled content, build mode, route availability). Anything that needs
 * backend data is shown as an explicit "backend not connected" state — never
 * a fabricated number. The data preparation below is kept separate from the
 * JSX so a real backend service can replace it without touching presentation.
 */

// ------------------------------------------------------------------ data prep

const guides = getAllGuides();

interface GuideSummary {
  id: string;
  label: string;
  toneClass: string;
  stepCount: number;
  contentVersion: string;
}

const guideSummaries: GuideSummary[] = guides.map((guide) => ({
  id: guide.id,
  label: guide.label,
  toneClass: CATEGORY_META[guide.id]?.toneClass ?? "tone-red",
  stepCount: guide.content.steps.length,
  contentVersion: guide.content.contentVersion,
}));

/** Tiles whose data is not available until Firebase-backed admin services exist. */
const backendPendingTiles = [
  {
    label: "Users",
    value: "Backend data not connected",
    note: "User statistics appear once the Firebase-backed admin services are connected.",
  },
  {
    label: "Medical Facilities",
    value: "Backend data not connected",
    note: "Facility counts appear once the verified facilities dataset is connected.",
  },
] as const;

// --------------------------------------------------------------- presentation

export function AdminDashboardPage(): JSX.Element {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>Dashboard</h1>
        <p>Overview of Lifeguard360 content, users, facilities, and system configuration.</p>
      </header>

      <section className={styles.tileGrid} aria-label="Overview">
        <div className={styles.tile}>
          <p className={styles.tileLabel}>First-Aid Guides</p>
          <p className={styles.tileValue}>{guides.length} categories configured</p>
          <Badge tone="amber" dot>
            Review pending
          </Badge>
        </div>
        {backendPendingTiles.map((tile) => (
          <div key={tile.label} className={styles.tile}>
            <p className={styles.tileLabel}>{tile.label}</p>
            <p className={styles.tileValue}>{tile.value}</p>
            <p className={styles.tileNote}>{tile.note}</p>
          </div>
        ))}
        <div className={styles.tile}>
          <p className={styles.tileLabel}>System</p>
          <p className={styles.tileValue}>Application running</p>
          <p className={styles.tileNote}>
            Frontend is operational; backend integration is pending.
          </p>
        </div>
      </section>

      <Card title="First-Aid Content" titleIcon="first-aid">
        <p className={styles.cardIntro}>
          {guides.length} configured emergency categories · content version{" "}
          {CONTENT_VERSION} · bundled application content (not yet backend-managed).
        </p>
        <ul className={styles.guideList}>
          {guideSummaries.map((guide) => (
            <li key={guide.id}>
              <Link to={`/admin/first-aid/${guide.id}`} className={styles.guideRow}>
                <span className={`${styles.guideSwatch} ${guide.toneClass}`} aria-hidden="true" />
                <span className={styles.guideName}>{guide.label}</span>
                <span className={styles.guideMeta}>
                  {guide.stepCount} steps · {guide.contentVersion}
                </span>
                <Icon name="chevron" size={16} className={styles.guideChevron} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <section className={styles.actionsRow} aria-label="Quick actions">
        <h2 className={styles.sectionTitle}>Quick actions</h2>
        <div className={styles.actionsGrid}>
          <Link to="/admin/first-aid" className={styles.actionLink}>
            <Icon name="first-aid" size={16} />
            Manage First-Aid Content
          </Link>
          <Link to="/admin/media" className={styles.actionLink}>
            <Icon name="upload" size={16} />
            Manage Media
          </Link>
          <Link to="/admin/map" className={styles.actionLink}>
            <Icon name="facility" size={16} />
            View Medical Facilities
          </Link>
          <Link to="/admin/users" className={styles.actionLink}>
            <Icon name="user" size={16} />
            View Users
          </Link>
        </div>
      </section>

      <div className={styles.statusGrid}>
        <Card title="System & Configuration" titleIcon="settings">
          <dl className={styles.statusList}>
            <div className={styles.statusRow}>
              <dt>Authentication</dt>
              <dd>Development admin access</dd>
            </div>
            <div className={styles.statusRow}>
              <dt>Backend</dt>
              <dd>Firebase integration pending</dd>
            </div>
            <div className={styles.statusRow}>
              <dt>Content source</dt>
              <dd>Bundled application content</dd>
            </div>
            <div className={styles.statusRow}>
              <dt>Environment</dt>
              <dd>Development</dd>
            </div>
          </dl>
        </Card>

        <Card title="Recent Activity" titleIcon="history">
          <p className={styles.emptyActivity}>
            No administrative activity recorded yet. Activity will appear here
            when audit logging is connected.
          </p>
        </Card>
      </div>
    </div>
  );
}
