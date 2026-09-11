import { Link } from "react-router";
import type { JSX } from "react";

import { GUIDE_LIST } from "@/data/firstAid";
import { Card } from "@/components/Card";
import { Icon } from "@/components/icons";
import { ButtonLink } from "@/components/Button";
import styles from "@/pages/HomePage.module.css";

export function HomePage(): JSX.Element {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>
            Your Safety Companion in <em>Emergencies</em>
          </h1>
          <p className={styles.heroSubtitle}>
            Quick guidance. Life-saving steps. Help is closer than you think.
          </p>
          <div className={styles.heroActions}>
            <ButtonLink href="/get-help" variant="danger" size="lg" icon="bell">
              Get Help Now
            </ButtonLink>
            <ButtonLink href="/first-aid" variant="outline" size="lg" icon="first-aid">
              First Aid Guide
            </ButtonLink>
          </div>
        </div>
      </section>

      <section aria-labelledby="situations-heading">
        <div className={styles.sectionHeading}>
          <h2 id="situations-heading">
            <Icon name="sos" size={22} /> Emergency Situations
          </h2>
          <span className={styles.sectionHint}>Choose a situation below</span>
        </div>

        <div className={styles.emergencyGrid}>
          {GUIDE_LIST.map((guide) => (
            <Link key={guide.id} to={`/first-aid/${guide.id}`} className={styles.emergencyCard}>
              <span className={styles.emergencyIcon} aria-hidden="true">
                <Icon name="first-aid" size={24} />
              </span>
              <span className={styles.emergencyBody}>
                <span className={styles.emergencyTitle}>{guide.label}</span>
                <span className={styles.emergencyDesc}>{guide.summary}</span>
              </span>
              <Icon name="chevron" size={18} className={styles.emergencyChevron} />
            </Link>
          ))}
        </div>
      </section>

      <div className={styles.asideRow}>
        <Card
          title="Quick First Aid Tips"
          titleIcon="check"
          actions={
            <ButtonLink href="/first-aid" variant="outline">
              View Full Guide
            </ButtonLink>
          }
        >
          <ul className={styles.tipList}>
            <li>Keep calm and act fast.</li>
            <li>Ensure the victim is in a safe place.</li>
            <li>Do not move the victim unnecessarily.</li>
            <li>Call for professional medical help.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
