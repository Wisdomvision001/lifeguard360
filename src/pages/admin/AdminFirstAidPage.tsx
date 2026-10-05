import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { JSX } from "react";

import { useFirstAidContent } from "@/app/providers/FirstAidContentProvider";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/icons";
import { CATEGORY_META } from "@/data/categoryMeta";
import { fetchGuideOverview, type GuideOverviewEntry } from "@/services/admin/adminGuideService";
import { getGuide } from "@/services/firstAid/firstAidService";
import styles from "@/pages/admin/AdminFirstAidPage.module.css";

/**
 * First-Aid Content registry (Admin).
 *
 * Rows show the REAL publication state per category, read from Firestore:
 * firstAidGuides (published, public) and firstAidDrafts (admin-only). The
 * source card reports what the public app currently serves — published
 * documents when the CMS content loaded, the bundled fallback otherwise —
 * with honest loading and error states. Nothing here is a fabricated
 * backend status.
 */

type OverviewState =
  | { kind: "loading" }
  | { kind: "ready"; entries: GuideOverviewEntry[] }
  | { kind: "error"; message: string };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function AdminFirstAidPage(): JSX.Element {
  const { source } = useFirstAidContent();
  const [overview, setOverview] = useState<OverviewState>({ kind: "loading" });

  const load = (): Promise<void> =>
    fetchGuideOverview()
      .then((entries) => setOverview({ kind: "ready", entries }))
      .catch((error: unknown) =>
        setOverview({
          kind: "error",
          message: `Publication status could not be read: ${messageOf(error)}`,
        }),
      );

  useEffect(() => {
    void load();
  }, []);

  const publishedCount =
    overview.kind === "ready" ? overview.entries.filter((entry) => entry.hasPublished).length : 0;
  const draftCount =
    overview.kind === "ready" ? overview.entries.filter((entry) => entry.hasDraft).length : 0;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>First-Aid Content</h1>
        <p>
          The emergency-guide knowledge base served by the public app. Each
          category carries one canonical protocol, its Quick Guide presentation,
          and its provenance.
        </p>
      </header>

      <Card title="Content source" titleIcon="first-aid">
        <div className={styles.sourceRow}>
          <Badge tone={source === "published" ? "success" : "neutral"} dot>
            {source === "published"
              ? "Public app serving published Firestore content"
              : "Public app serving bundled fallback content"}
          </Badge>
          {overview.kind === "loading" && <Badge tone="neutral">Reading Firestore…</Badge>}
          {overview.kind === "ready" && (
            <Badge tone="blue" dot>
              {publishedCount} published · {draftCount} draft{draftCount === 1 ? "" : "s"}
            </Badge>
          )}
          {overview.kind === "error" && <Badge tone="danger" dot>Status unavailable</Badge>}
        </div>
        {overview.kind === "error" && (
          <div className={styles.errorBox} role="alert">
            <p className={styles.stateText}>{overview.message}</p>
            <Button variant="outline" icon="history" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}
        {overview.kind === "ready" && (
          <p className={styles.sourceNote}>
            {publishedCount === 0
              ? "No guide documents are published to Firestore yet — the public app serves the bundled fallback dataset, which stays intact as the safety net."
              : "Published guides are served to the public app from Firestore; categories without a published document keep the bundled fallback."}{" "}
            Drafts are admin-only working copies and never affect the public app.
          </p>
        )}
        {overview.kind === "loading" && (
          <p className={styles.sourceNote}>Reading publication state from Firestore…</p>
        )}
      </Card>

      <section aria-label="Guide registry">
        <ul className={styles.registry}>
          {(overview.kind === "ready"
            ? overview.entries
            : null
          )?.map((entry) => {
            const guide = getGuide(entry.id);
            if (guide === null) return null;
            const stepImageCount = guide.content.steps.filter(
              (step) => step.image !== undefined,
            ).length;
            const provenance = guide.content.provenance[0];
            return (
              <li key={entry.id}>
                <Link to={`/admin/first-aid/${entry.id}`} className={styles.registryRow}>
                  <span
                    className={`${styles.swatch} ${CATEGORY_META[entry.id]?.toneClass ?? "tone-red"}`}
                    aria-hidden="true"
                  />
                  <span className={styles.registryBody}>
                    <span className={styles.registryTitle}>{entry.label}</span>
                    <span className={styles.registrySummary}>{guide.summary}</span>
                    <span className={styles.registryMeta}>
                      {guide.content.steps.length} steps · version {guide.content.contentVersion}
                    </span>
                    <span className={styles.registryTags}>
                      <Badge tone="amber" dot>
                        Review pending
                      </Badge>
                      <Badge tone="neutral">
                        Media:{" "}
                        {stepImageCount > 0
                          ? `${stepImageCount} step image${stepImageCount === 1 ? "" : "s"}`
                          : "no step images"}
                      </Badge>
                      {entry.hasPublished ? (
                        <Badge tone="success" dot>
                          Published to Firebase
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Not published — bundled fallback</Badge>
                      )}
                      {entry.hasDraft && (
                        <Badge tone="blue" dot>
                          Draft saved
                          {entry.draftUpdatedAt !== ""
                            ? ` ${entry.draftUpdatedAt.slice(0, 10)}`
                            : ""}
                        </Badge>
                      )}
                    </span>
                    {provenance !== undefined && (
                      <span className={styles.registryProvenance}>
                        Provenance: {provenance.source}
                      </span>
                    )}
                  </span>
                  <Icon name="chevron" size={18} className={styles.chevron} />
                </Link>
              </li>
            );
          })}
          {overview.kind === "loading" &&
            new Array(6).fill(null).map((_, index) => (
              <li key={`loading-${index}`}>
                <span className={`${styles.registryRow} ${styles.registryLoading}`}>
                  <span className={styles.stateText} aria-busy="true">
                    Reading publication state…
                  </span>
                </span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
