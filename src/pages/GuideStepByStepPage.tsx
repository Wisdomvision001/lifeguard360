import { useState } from "react";
import { Link, useParams } from "react-router";
import type { JSX } from "react";

import { getGuide, getStep } from "@/services/firstAid/firstAidService";
import { assetPath } from "@/utils/paths";
import { Badge } from "@/components/Badge";
import { Button, ButtonLink } from "@/components/Button";
import { Icon } from "@/components/icons";
import { Card } from "@/components/Card";
import styles from "@/pages/GuideStepByStepPage.module.css";

/**
 * Step-by-Step Guide (Task 3).
 *
 * Presents the canonical `GuideStep[]` from the bundled dataset one step at a
 * time. UI only: no medical wording is created or altered here — missing
 * images and warnings are honest absences, and the content version stays
 * `0.1.0-unreviewed`.
 */
export function GuideStepByStepPage(): JSX.Element {
  const { categoryId } = useParams<{ categoryId: string }>();
  const guide = getGuide(categoryId ?? "");

  const [currentStep, setCurrentStep] = useState(0);
  const [finished, setFinished] = useState(false);

  // The route element stays mounted when :categoryId changes — reset the
  // progression during render (React's adjust-state-on-prop-change pattern)
  // so a new category always starts at step 1.
  const [prevCategoryId, setPrevCategoryId] = useState(categoryId);
  if (prevCategoryId !== categoryId) {
    setPrevCategoryId(categoryId);
    setCurrentStep(0);
    setFinished(false);
  }

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

  const total = guide.content.steps.length;
  const stepNumber = currentStep + 1;
  const step = getStep(guide, stepNumber);
  const isLast = currentStep === total - 1;

  if (step === null) {
    // Defensive: cannot normally happen while 0 <= currentStep < total.
    return (
      <Card title="Guide unavailable" titleIcon="alert">
        <p>
          This guide could not be displayed.{" "}
          <Link to={`/first-aid/${guide.id}`}>Back to {guide.label}</Link>.
        </p>
      </Card>
    );
  }

  const goPrevious = (): void => {
    setFinished(false);
    setCurrentStep((index) => Math.max(0, index - 1));
  };

  const goNext = (): void => {
    if (isLast) {
      setFinished(true);
    } else {
      setCurrentStep((index) => Math.min(total - 1, index + 1));
    }
  };

  return (
    <article>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link to="/first-aid">First Aid</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/first-aid/${guide.id}`}>{guide.label}</Link>
        <span aria-hidden="true">/</span>
        <span>Step-by-Step Guide</span>
      </nav>

      <header className={styles.header}>
        <div>
          <h1>{guide.label}</h1>
          <p className={styles.modeLabel}>Step-by-Step Guide</p>
        </div>
        <div className={styles.headerMeta}>
          <Badge tone="amber" dot>
            Review status: {guide.content.provenance[0]?.source ?? "pending review"}
          </Badge>
          <Badge tone="neutral">Version {guide.content.contentVersion}</Badge>
        </div>
      </header>

      {finished ? (
        <Card title="End of this guide" titleIcon="check">
          <div className={styles.completion}>
            <p>
              You’ve reached the end of the {guide.label} step-by-step guide.
            </p>
            <p>
              If the situation is serious or worsening, get emergency assistance
              immediately.
            </p>
            <div className={styles.escapeRow}>
              <ButtonLink href="/get-help" variant="danger" size="lg" icon="phone">
                Get Help Now
              </ButtonLink>
              <ButtonLink
                href={`/first-aid/${guide.id}`}
                variant="outline"
                size="lg"
                icon="first-aid"
              >
                Back to Guide
              </ButtonLink>
            </div>
          </div>
        </Card>
      ) : (
        <section className={styles.stepPanel} aria-label={`Step ${stepNumber} of ${total}`}>
          <p className={styles.progressLabel} aria-live="polite">
            Step {stepNumber} of {total}: {step.title}
          </p>
          <progress
            className={styles.progressBar}
            max={total}
            value={stepNumber}
            aria-label={`${guide.label} guide progress`}
          />

          {/* Instructional visual area — populated in a later task. No image is
              invented for steps that do not have one. */}
          {step.image !== undefined ? (
            <figure className={styles.visual}>
              <img src={assetPath(step.image)} alt={step.imageAlt ?? ""} />
            </figure>
          ) : (
            <div className={styles.visualPlaceholder}>
              <Icon name="first-aid" size={28} />
              <span>Instructional visual not yet available for this step.</span>
            </div>
          )}

          <h2 className={styles.stepTitle}>{step.title}</h2>
          <p className={styles.stepText}>{step.text}</p>

          {step.warning !== undefined && (
            <div className={styles.warning} role="note">
              <p className={styles.warningTitle}>
                <Icon name="alert" size={16} /> Caution
              </p>
              <p>{step.warning}</p>
            </div>
          )}

          <div className={styles.controls}>
            <Button
              variant="outline"
              onClick={goPrevious}
              disabled={currentStep === 0}
            >
              Previous
            </Button>
            <Button variant="primary" onClick={goNext}>
              {isLast ? "Finish Guide" : "Next"}
            </Button>
          </div>

          <div className={styles.escapeRow}>
            <ButtonLink href="/get-help" variant="danger" icon="phone">
              Get Help Now
            </ButtonLink>
            <ButtonLink
              href={`/first-aid/${guide.id}`}
              variant="outline"
              icon="first-aid"
            >
              Back to {guide.label}
            </ButtonLink>
          </div>
        </section>
      )}
    </article>
  );
}
