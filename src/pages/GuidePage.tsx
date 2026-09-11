import { useParams, Link } from "react-router";
import type { JSX } from "react";

import { getGuide, guideToSpeechText } from "@/services/firstAid/firstAidService";
import { useSpeech } from "@/hooks/useSpeech";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
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

      <div className={styles.grid}>
        <div className={styles.main}>
          <Card title="Step-by-step instructions" titleIcon="first-aid">
            <ol className={styles.steps}>
              {content.steps.map((step, index) => (
                <li key={step}>
                  <span className={styles.stepNumber} aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>{step}</span>
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
