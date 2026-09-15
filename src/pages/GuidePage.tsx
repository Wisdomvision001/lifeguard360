import { useParams, Link } from "react-router";
import type { JSX } from "react";

import { getGuide, guideToSpeechText } from "@/services/firstAid/firstAidService";
import { useSpeech } from "@/hooks/useSpeech";
import { assetPath } from "@/utils/paths";
import { Badge } from "@/components/Badge";
import { Button, ButtonLink } from "@/components/Button";
import { Icon } from "@/components/icons";
import { Card } from "@/components/Card";
import { useOffline } from "@/app/providers/OfflineProvider";
import { getOfflinePackageMeta } from "@/services/offline/offlineContentService";
import styles from "@/pages/GuidePage.module.css";

export function GuidePage(): JSX.Element {
  const { categoryId } = useParams<{ categoryId: string }>();
  const guide = getGuide(categoryId ?? "");
  const speech = useSpeech();
  const { meta } = useOffline();

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

  const content = guide.content;
  const speechText = guideToSpeechText(guide);
  const availableOffline =
    meta !== null && getOfflinePackageMeta()?.categories.includes(guide.id) === true;

  const togglePlay = (): void => {
    if (speech.status === "speaking") {
      speech.pause();
    } else if (speech.status === "paused") {
      speech.resume();
    } else {
      speech.speak(speechText);
    }
  };

  return (
    <article>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link to="/first-aid">First Aid</Link>
        <span aria-hidden="true">/</span>
        <span>{guide.label}</span>
      </nav>

      <header className={styles.header}>
        {guide.image !== undefined && (
          <img
            src={assetPath(guide.image)}
            alt={`First aid for ${guide.label.toLowerCase()}`}
            className={styles.headerImage}
            width={280}
            height={158}
          />
        )}
        <div>
          <h1>{guide.label}</h1>
          <p className={styles.summary}>{content.summary}</p>
        </div>
        <div className={styles.headerMeta}>
          <Badge tone="amber" dot>
            Review status: {content.provenance[0]?.source ?? "pending review"}
          </Badge>
          <Badge tone="neutral">Version {content.contentVersion}</Badge>
          {availableOffline && (
            <Badge tone="blue" dot>
              Available offline
            </Badge>
          )}
        </div>
      </header>

      {speech.supported && (
        <div className={styles.speechBar} role="group" aria-label="Read guide aloud">
          <Button
            variant={speech.status === "speaking" ? "outline" : "primary"}
            icon={speech.status === "speaking" ? "pause" : "play"}
            onClick={togglePlay}
          >
            {speech.status === "speaking"
              ? "Pause"
              : speech.status === "paused"
                ? "Resume"
                : "Read aloud"}
          </Button>
          <Button variant="outline" icon="stop" onClick={speech.stop}>
            Stop
          </Button>
          <span className={styles.speechHint} aria-live="polite">
            {speech.status === "speaking"
              ? "Reading aloud…"
              : speech.status === "paused"
                ? "Paused"
                : "Text-to-speech assistance"}
          </span>
        </div>
      )}

      {/* ---- Mode selection (Task 2): Quick Guide vs Step-by-Step ---- */}
      <section className={styles.modeSection} aria-labelledby="mode-heading">
        <h2 id="mode-heading">Choose how you want to receive first-aid guidance</h2>
        <div className={styles.modeGrid}>
          <Link to={`/first-aid/${guide.id}/quick`} className={styles.modeCard}>
            <span className={`${styles.modeIcon} ${styles.modeIconQuick}`} aria-hidden="true">
              <Icon name="check" size={24} />
            </span>
            <span className={styles.modeBody}>
              <span className={styles.modeTitle}>Quick Guide</span>
              <span className={styles.modeText}>
                I know the basics — show me the essential actions.
              </span>
            </span>
            <Icon name="chevron" size={18} className={styles.modeChevron} />
          </Link>
          <Link to={`/first-aid/${guide.id}/steps`} className={styles.modeCard}>
            <span className={`${styles.modeIcon} ${styles.modeIconSteps}`} aria-hidden="true">
              <Icon name="first-aid" size={24} />
            </span>
            <span className={styles.modeBody}>
              <span className={styles.modeTitle}>Step-by-Step Guide</span>
              <span className={styles.modeText}>
                I’m not sure what to do — guide me through it step by step.
              </span>
            </span>
            <Icon name="chevron" size={18} className={styles.modeChevron} />
          </Link>
        </div>

        <div className={styles.escape}>
          <h2 className={styles.escapeLabel}>Need emergency assistance?</h2>
          <div className={styles.escapeRow}>
            <ButtonLink
              href="/get-help"
              variant="danger"
              size="lg"
              icon="phone"
              className={styles.actionBtn}
            >
              Get Help Now
            </ButtonLink>
            <ButtonLink
              href="/facilities"
              variant="success"
              size="lg"
              icon="facility"
              className={styles.actionBtn}
            >
              Find Nearby Hospital
            </ButtonLink>
          </div>
        </div>
      </section>

      <div className={styles.importantBox} role="note">
        <p className={styles.importantTitle}>
          <Icon name="alert" size={16} /> Important
        </p>
        <p>Act quickly. Early medical treatment can save lives.</p>
      </div>

      <div className={styles.grid}>
        <div className={styles.main}>
          <Card title="Full guide (interim)" titleIcon="first-aid">
            <p className={styles.interimNote}>
              While the Quick Guide and Step-by-Step views are being prepared, the complete
              guide remains available here.
            </p>
            <ol className={styles.steps}>
              {content.steps.map((step, index) => (
                <li key={step.title}>
                  <span className={styles.stepNumber} aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>{step.text}</span>
                </li>
              ))}
            </ol>
          </Card>

          <div className={styles.dosDonts}>
            <Card title="Do" titleIcon="check">
              <ul className={styles.dosList}>
                {content.dos.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Card>
            <Card title="Do not" titleIcon="alert">
              <ul className={styles.dontsList}>
                {content.donts.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Card>
          </div>

          <Card title="When to seek professional help" titleIcon="sos">
            <ul className={styles.seekHelpList}>
              {content.whenToSeekHelp.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>
        </div>

        <aside className={styles.aside}>
          <Card title="Provenance & review" titleIcon="history">
            <ul className={styles.provenanceList}>
              {content.provenance.map((entry) => (
                <li key={entry.claim}>
                  <strong>{entry.claim}</strong>
                  <span>{entry.source}</span>
                  {entry.verifiedAt !== "" && <span>Verified {entry.verifiedAt}</span>}
                </li>
              ))}
            </ul>
            <p className={styles.disclaimer}>
              Lifeguard360 provides first-aid assistance guidance, not professional medical
              diagnosis. In a life-threatening emergency, contact professional medical help.
            </p>
          </Card>
        </aside>
      </div>
    </article>
  );
}
