import { Link } from "react-router";
import type { JSX } from "react";

import { GUIDE_LIST } from "@/data/firstAid";
import { assetPath } from "@/utils/paths";
import { Card } from "@/components/Card";
import { Icon } from "@/components/icons";
import styles from "@/pages/FirstAidPage.module.css";

export function FirstAidPage(): JSX.Element {
  return (
    <div>
      <header className={styles.header}>
        <div>
          <h1>First Aid Guide</h1>
          <p>
            Clear, conservative first-aid guidance for the six supported emergency categories. Text
            is the primary source of information; read-aloud assistance is available on each guide.
          </p>
        </div>
        <img
          src={assetPath("/images/first-aid.jpg")}
          alt="Person practising CPR on a training mannequin"
          className={styles.headerImage}
          width={280}
          height={158}
        />
      </header>

      <div className={styles.grid}>
        {GUIDE_LIST.map((guide) => (
          <Link key={guide.id} to={`/first-aid/${guide.id}`} className={styles.card}>
            {guide.image !== undefined && (
              <span className={styles.thumb} aria-hidden="true">
                <img src={assetPath(guide.image)} alt="" loading="lazy" width={88} height={66} />
              </span>
            )}
            <span className={styles.body}>
              <span className={styles.title}>{guide.label}</span>
              <span className={styles.summary}>{guide.summary}</span>
              <span className={styles.meta}>
                {guide.content.steps.length} steps · version {guide.content.contentVersion}
              </span>
            </span>
            <Icon name="chevron" size={18} className={styles.chevron} />
          </Link>
        ))}
      </div>

      <Card title="About this content" titleIcon="alert">
        <p className={styles.note}>
          Guidance is pending formal clinical review against a verified first-aid source. Review
          status and provenance for every guide are displayed on the guide page — nothing here
          replaces professional medical advice.
        </p>
      </Card>
    </div>
  );
}
