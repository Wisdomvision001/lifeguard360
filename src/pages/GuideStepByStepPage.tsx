import { useState } from "react";
import { Link, useParams } from "react-router";
import type { JSX } from "react";

import { getGuide, getStep, getTreatment, getTreatmentStepsForGroup } from "@/services/firstAid/firstAidService";
import type { FirstAidGuide } from "@/types";
import { assetPath } from "@/utils/paths";
import { Badge } from "@/components/Badge";
import { Button, ButtonLink } from "@/components/Button";
import { Icon } from "@/components/icons";
import { Card } from "@/components/Card";
import {
  type PatientGroup,
  type TreatmentAction,
  AGE_SELECTION_OPTIONS,
} from "@/types";
import styles from "@/pages/GuideStepByStepPage.module.css";

/**
 * Step-by-Step Guide (Task 3 / Phase 2 treatment integration).
 *
 * When a guide has `content.treatment`, this renders the structured practical
 * treatment flow: immediate actions, age selection (where required), ordered
 * treatment steps with explanations and warnings, avoid list, and escalation
 * criteria. When a guide does not yet have `treatment`, the existing interim
 * `GuideStep[]` render is preserved.
 */
/**
 * Treatment flow renderer for guides that carry `content.treatment`.
 *
 * This is the Phase 2 integration point for practical, ordered, age-aware
 * treatment instructions. It reads curated content only — no medical wording
 * is generated or altered here.
 */

function actionAppliesTo(
  action: TreatmentAction,
  group: PatientGroup,
): boolean {
  const applies = action.appliesTo;
  if (applies === "all") {
    return true;
  }
  if (Array.isArray(applies)) {
    return applies.includes(group);
  }
  return false;
}

function currentGroupLabel(group: PatientGroup): string {
  return (
    AGE_SELECTION_OPTIONS.find((option) => option.value === group)?.label ??
    group.replace("-", " ")
  );
}

function TreatmentFlow({
  guide,
  currentGroup,
  onGroupChange,
  currentStep,
  setCurrentStep,
  finished,
  setFinished,
}: {
  guide: FirstAidGuide;
  currentGroup: PatientGroup;
  onGroupChange: (group: PatientGroup) => void;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  finished: boolean;
  setFinished: (value: boolean) => void;
}): JSX.Element | null {
  const treatment = getTreatment(guide);
  if (!treatment) {
    return null;
  }

  const steps = getTreatmentStepsForGroup(guide, currentGroup);
  const immediateActions = treatment.immediateActions.filter(
    (action) => actionAppliesTo(action, currentGroup),
  );
  const requiresAge = treatment.requiresAgeBeforeProcedure && currentGroup === "unknown";

  if (finished) {
    return (
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
    );
  }

  if (requiresAge) {
    return (
      <Card title="Who needs first aid?" titleIcon="info">
        <p className={styles.stepText}>
          Some first-aid actions differ by age. Choose the patient group if you know it.
          If you are not sure, choose “Not sure” — we will show only the actions that are
          safe to give without assuming the patient’s age.
        </p>
        <div className={styles.ageOptions} role="group" aria-label="Patient group">
          {AGE_SELECTION_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`${styles.ageOption} ${currentGroup === option.value ? styles.ageOptionActive : ""}`}
              onClick={() => onGroupChange(option.value)}
            >
              {option.label}
            </button>
          ))}
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
      </Card>
    );
  }

  if (steps.length === 0) {
    return (
      <Card title="No steps for this group yet" titleIcon="alert">
        <p>
          No {currentGroupLabel(currentGroup)} treatment steps are available for this guide yet.
        </p>
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
      </Card>
    );
  }

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  return (
    <section className={styles.stepPanel} aria-label={`Step ${currentStep + 1} of ${steps.length}`}>
      {immediateActions.length > 0 && currentStep === 0 && (
        <div className={styles.immediateActions}>
          <p className={styles.immediateLabel}>
            <Icon name="sos" size={14} /> Immediate actions
          </p>
          <ul className={styles.immediateList}>
            {immediateActions.map((action, index) => (
              <li key={index}>
                <p className={styles.immediateTitle}>{action.title}</p>
                <p className={styles.immediateText}>{action.text}</p>
                {action.caution && (
                  <p className={styles.immediateCaution}>Do not: {action.caution}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {currentStep > 0 && (
        <div className={styles.treatmentMeta}>
          <p className={styles.procedureLabel}>
            Showing guidance for: {currentGroupLabel(currentGroup)}.
          </p>
          <div className={styles.ageActions}>
            <Button
              variant="outline"
              size="md"
              onClick={() => onGroupChange("unknown")}
            >
              Change who this is for
            </Button>
          </div>
        </div>
      )}

      <p className={styles.progressLabel} aria-live="polite">
        Step {currentStep + 1} of {steps.length}: {step.title}
      </p>
      <progress
        className={styles.progressBar}
        max={steps.length}
        value={currentStep + 1}
        aria-label={`${guide.label} treatment progress`}
      />

      {/* Illustrations supplied for this procedure, age-specific where the
          supplied artwork differs by patient group. No image is invented for
          a step that has none. */}
      {step.image !== undefined ? (
        <figure className={styles.visual}>
          <img src={assetPath(step.image)} alt={step.imageAlt ?? ""} />
        </figure>
      ) : null}

      <h2 className={styles.stepTitle}>{step.title}</h2>
      <p className={styles.stepText}>{step.instruction}</p>

      {step.explanation !== undefined && step.explanation !== step.instruction && (
        <p className={styles.stepExplanation}>{step.explanation}</p>
      )}

      {step.warning && (
        <div className={styles.warning} role="note">
          <p className={styles.warningTitle}>
            <Icon name="alert" size={16} /> Caution
          </p>
          <p>{step.warning}</p>
        </div>
      )}

      {step.nextStepCriteria && (
        <div className={styles.nextCriteria} role="note">
          <p className={styles.nextCriteriaTitle}>
            <Icon name="info" size={14} /> When to move on
          </p>
          <p>{step.nextStepCriteria}</p>
        </div>
      )}

      {step.followUp && (
        <div className={styles.followUp}>
          <p className={styles.followUpTitle}>Next: {step.followUp.label}</p>
        </div>
      )}

      <div className={styles.controls}>
        <Button
          variant="outline"
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
        >
          Previous
        </Button>
        <Button variant="primary" onClick={() => isLast ? setFinished(true) : setCurrentStep(currentStep + 1)}>
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
  );
}

export function GuideStepByStepPage(): JSX.Element {
  const { categoryId } = useParams<{ categoryId: string }>();
  const guide = getGuide(categoryId ?? "");

  const [currentStep, setCurrentStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const [currentGroup, setCurrentGroup] = useState<PatientGroup>("unknown");

  // The route element stays mounted when :categoryId changes — reset the
  // progression during render (React's adjust-state-on-prop-change pattern)
  // so a new category always starts at step 1.
  const [prevCategoryId, setPrevCategoryId] = useState(categoryId);
  if (prevCategoryId !== categoryId) {
    setPrevCategoryId(categoryId);
    setCurrentStep(0);
    setFinished(false);
    setCurrentGroup("unknown");
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
    setCurrentStep(Math.max(0, currentStep - 1));
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

      {getTreatment(guide) && (
        <TreatmentFlow
          guide={guide as FirstAidGuide}
          currentGroup={currentGroup}
          onGroupChange={setCurrentGroup}
          currentStep={currentStep}
          setCurrentStep={setCurrentStep}
          finished={finished}
          setFinished={setFinished}
        />
      )}

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
