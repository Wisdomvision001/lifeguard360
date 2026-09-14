import { Link, useParams } from "react-router";
import type { JSX } from "react";

import { getGuide } from "@/services/firstAid/firstAidService";
import { Badge } from "@/components/Badge";
import { ButtonLink } from "@/components/Button";
import { Icon } from "@/components/icons";
import { Card } from "@/components/Card";
import styles from "@/pages/GuideQuickPage.module.css";

/**
 * Quick Guide (Task 4).
 *
 * A fast-scanning memory aid for users who know the basics and need the
 * essential actions right now. Consumes the explicitly stored
 * `guide.content.quickGuide` — no runtime summarisation, no medical wording
 * created or altered here. Missing quickGuide data renders an honest
 * non-medical error state.
 */
export function GuideQuickPage(): JSX.Element {
  const { categoryId } = useParams<{ categoryId: string }>();
  const guide = getGuide(categoryId ?? "");

  if (guide === null) {
    return (
      <Card title="Guide not found" titleIcon="alert">
        <p>
          The requested first-aid guide does not exist.{" "}
          <Link to="/first-aid">Browse all guides</Link>.
        </p>
      </Card>
    );
  }

  const quickGuide = guide.content.quickGuide;

  if (quickGuide === undefined) {
    return (
      <Card title="Quick Guide unavailable" titleIcon="alert">
        <p>
          The quick reference for <strong>{guide.label}</strong> could not be
          loaded. <Link to={`/first-aid/${guide.id}`}>Back to {guide.label}</Link>.
        </p>
      </Card>
    );
  }

  return (
    <article>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link to="/first-aid">First Aid</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/first-aid/${guide.id}`}>{guide.label}</Link>
        <span aria-hidden="true">/</span>
        <span>Quick Guide</span>
      </nav>

      <header className={styles.header}>
        {guide.image !== undefined && (
          <img
            src={guide.image}
            alt={`First aid for ${guide.label.toLowerCase()}`}
            className={styles.headerImage}
            width={280}
            height={158}
          />
        )}
        <div>
          <h1>{guide.label}</h1>
          <p className={styles.modeLabel}>Quick Guide</p>
          <div className={styles.headerMeta}>
            <Badge tone="amber" dot>
              Review status: {guide.content.provenance[0]?.source ?? "pending review"}
            </Badge>
            <Badge tone="neutral">Version {guide.content.contentVersion}</Badge>
          </div>
        </div>
      </header>

      <section className={styles.panel} aria-label={`${guide.label} quick guide`}>
        <p className={styles.modeIntro}>
          Essential actions to remember right now.
        </p>

        <div className={styles.priority}>
          <p className={styles.priorityLabel}>
            <Icon name="sos" size={16} /> Immediate priority
          </p>
          <p className={styles.priorityText}>{quickGuide.immediatePriority}</p>
        </div>

        <section className={styles.actions}>
          <h2 id="essential-actions-heading">Essential actions</h2>
          <ol className={styles.actionsList} aria-labelledby="essential-actions-heading">
            {quickGuide.essentialActions.map((action, index) => (
              <li key={action}>
                <span className={styles.actionNumber} aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{action}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.donts} aria-labelledby="critical-donts-heading">
          <h2 id="critical-donts-heading">Do not</h2>
          <ul className={styles.dontsList}>
            {quickGuide.criticalDonts.map((dont) => (
              <li key={dont}>{dont}</li>
            ))}
          </ul>
        </section>

        <div className={styles.escapeRow}>
          <ButtonLink href="/get-help" variant="danger" size="lg" icon="phone">
            Get Help Now
          </ButtonLink>
        </div>

        <div className={styles.switchRow}>
          <p>Not sure what to do?</p>
          <ButtonLink
            href={`/first-aid/${guide.id}/steps`}
            variant="primary"
            size="lg"
            icon="first-aid"
          >
            Open Step-by-Step Guide
          </ButtonLink>
        </div>
      </section>
    </article>
  );
}
