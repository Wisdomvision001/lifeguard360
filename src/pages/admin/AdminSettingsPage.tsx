import type { JSX } from "react";

import { useFirstAidContent } from "@/app/providers/FirstAidContentProvider";
import { isFirebaseConfigured } from "@/services/firebase/client";
import { CONTENT_VERSION } from "@/data/firstAid";
import { getAllGuides } from "@/services/firstAid/firstAidService";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import styles from "@/pages/admin/AdminSettingsPage.module.css";

/**
 * Admin Settings.
 *
 * HONESTY: only settings that actually exist are shown, read from the
 * running application — no decorative switches wired to nothing. Each
 * not-yet-implemented area is labelled as such instead of being presented
 * as a working control.
 */
export function AdminSettingsPage(): JSX.Element {
  const guides = getAllGuides();
  const { source: contentSource } = useFirstAidContent();

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>Settings</h1>
        <p>
          Current application configuration, read from the running build.
          Controls for unimplemented areas are not shown — only real values.
        </p>
      </header>

      <Card title="Content configuration" titleIcon="first-aid">
        <dl className={styles.settingsList}>
          <div className={styles.settingRow}>
            <dt>First-aid content source</dt>
            <dd>
              Bundled fallback dataset ({guides.length} categories){" "}
              {contentSource === "published" ? (
                <Badge tone="success" dot>Serving published Firestore content</Badge>
              ) : (
                <Badge tone="neutral" dot>Bundled fallback active</Badge>
              )}
            </dd>
          </div>
          <div className={styles.settingRow}>
            <dt>Content version</dt>
            <dd>
              <code>{CONTENT_VERSION}</code>{" "}
              <Badge tone="amber" dot>Review pending</Badge>
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="System configuration" titleIcon="settings">
        <dl className={styles.settingsList}>
          <div className={styles.settingRow}>
            <dt>Firebase configuration</dt>
            <dd>{isFirebaseConfigured() ? "Configured" : "Not configured (development mode)"}</dd>
          </div>
          <div className={styles.settingRow}>
            <dt>Firestore rules</dt>
            <dd>Deployed rules enforce all data access; no client-side overrides.</dd>
          </div>
          <div className={styles.settingRow}>
            <dt>Admin authorization</dt>
            <dd>
              Firebase Auth custom claim (<code>admin === true</code>), set via
              the <code>npm run set:admin</code> tooling.
            </dd>
          </div>
          <div className={styles.settingRow}>
            <dt>Media storage</dt>
            <dd>
              Firebase Storage (<code>images/</code>, admin-gated uploads) plus
              bundled <code>public/images</code> fallback assets.
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="Not yet implemented" titleIcon="alert">
        <ul className={styles.pendingList}>
          <li>Editable application settings — none exist yet; anything shown would be inert.</li>
          <li>Legal/tabs configuration (account, application, legal, content, system) — not implemented; no inert controls are shown.</li>
        </ul>
      </Card>
    </div>
  );
}
