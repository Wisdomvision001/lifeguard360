import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { JSX } from "react";

import { useFirstAidContent } from "@/app/providers/FirstAidContentProvider";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Field, TextField } from "@/components/Field";
import { ImagePicker } from "@/components/ImagePicker";
import {
  discardDraft,
  fetchDraft,
  publishGuide,
  saveDraft,
} from "@/services/admin/adminGuideService";
import { getGuide, isPublished } from "@/services/firstAid/firstAidService";
import styles from "@/pages/admin/AdminGuideEditorPage.module.css";
import {
  fromDraft,
  isDirty,
  isDraftValid,
  toDraft,
  validateDraft,
  type GuideDraft,
  type GuideDraftErrors,
  type StepDraft,
} from "@/pages/admin/guideEditorDraft";
import { isEmergencyCategoryId, type FirstAidGuide } from "@/types";

/**
 * Guide Editor (Admin CMS): draft → validate → publish over the real
 * Firestore contract.
 *
 * Load precedence per category: saved draft (firstAidDrafts) ?? published
 * document (firstAidGuides, via the merged store) ?? bundled dataset — so the
 * editor always starts from the freshest honest source and the public app's
 * fallback chain is what the admin sees. Saving writes ONLY the admin-only
 * draft; publishing writes the public document (server-set timestamp). Every
 * state — loading, saving, saved, failed, publishing, published, failed — is
 * reported truthfully; a failure never claims success and never discards the
 * admin's unsaved work.
 *
 * VARIANT-READY: the editor edits the one canonical protocol of the category.
 * Optional protocol variants (e.g. Adult/Child/Infant for CPR) are a separate
 * concept that will layer on top later; they are never assumed to exist here,
 * and none of the six current guides carries variants.
 */

interface Baseline {
  guide: FirstAidGuide;
  source: "draft" | "published" | "bundled";
  updatedAt: string;
  /** Whether a draft document exists in Firestore right now. */
  hasDraft: boolean;
}

interface LoadState {
  phase: "loading" | "ready";
  baseline: Baseline | null;
  /** Honest warning when the draft could not be loaded (state unknown). */
  warning: string | null;
}

interface OperationState {
  kind: "idle" | "saving" | "saved" | "failed" | "publishing" | "published";
  message?: string;
  at?: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function clockTime(at: Date): string {
  return at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const ListEditor = ({
  label,
  items,
  errors,
  onChange,
  onAdd,
  onRemove,
  addLabel,
}: {
  label: string;
  items: string[];
  errors: { items: (string | undefined)[]; list?: string };
  onChange: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  addLabel: string;
}): JSX.Element => (
  <Field label={label} htmlFor={`${label}-0`} error={errors.list}>
    <ol className={styles.listEditor}>
      {items.map((item, index) => (
        <li key={index}>
          <div className={styles.listRow}>
            <input
              id={index === 0 ? `${label}-0` : undefined}
              className={styles.listInput}
              value={item}
              onChange={(event) => onChange(index, event.target.value)}
            />
            <Button
              variant="ghost"
              icon="close"
              aria-label={`Remove item ${index + 1} from ${label}`}
              onClick={() => onRemove(index)}
            >
              <span className={styles.visuallyHidden}>Remove</span>
            </Button>
          </div>
          {errors.items[index] !== undefined && (
            <p className={styles.listItemError} role="alert">
              {errors.items[index]}
            </p>
          )}
        </li>
      ))}
    </ol>
    <Button variant="outline" icon="check" onClick={onAdd}>
      {addLabel}
    </Button>
  </Field>
);

export function AdminGuideEditorPage(): JSX.Element {
  const { categoryId } = useParams<{ categoryId: string }>();
  const { refresh } = useFirstAidContent();

  const [loadState, setLoadState] = useState<LoadState>({
    phase: "loading",
    baseline: null,
    warning: null,
  });
  const [draft, setDraft] = useState<GuideDraft | null>(null);
  const [errors, setErrors] = useState<GuideDraftErrors | null>(null);
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const [operation, setOperation] = useState<OperationState>({ kind: "idle" });
  const [confirmingDiscardDraft, setConfirmingDiscardDraft] = useState(false);

  // The route element stays mounted when :categoryId changes — reset editor
  // state during render (React's adjust-state-on-prop-change pattern) so a
  // new category always starts from a fresh loading state, then the effect
  // below loads draft/published/bundled for that category.
  const [prevCategoryId, setPrevCategoryId] = useState(categoryId);
  if (prevCategoryId !== categoryId) {
    setPrevCategoryId(categoryId);
    setLoadState({ phase: "loading", baseline: null, warning: null });
    setDraft(null);
    setErrors(null);
    setValidationNotice(null);
    setOperation({ kind: "idle" });
    setConfirmingDiscardDraft(false);
  }

  useEffect(() => {
    let cancelled = false;
    const id = categoryId ?? "";

    type DraftLoad = {
      loaded: { guide: FirstAidGuide | null; updatedAt: string };
      warning: string | null;
    };
    const emptyLoad: DraftLoad = { loaded: { guide: null, updatedAt: "" }, warning: null };

    // All state updates live in promise callbacks — never synchronously in
    // the effect body (the project's react-hooks/set-state-in-effect
    // convention).
    const draftLoad: Promise<DraftLoad> = isEmergencyCategoryId(id)
      ? fetchDraft(id).then(
          (loaded): DraftLoad => ({ loaded, warning: null }),
          (error: unknown): DraftLoad => ({
            loaded: { guide: null, updatedAt: "" },
            warning: `The saved draft could not be loaded: ${messageOf(error)}`,
          }),
        )
      : Promise.resolve(emptyLoad);

    refresh()
      .then(() => draftLoad)
      .then(({ loaded, warning }) => {
        if (cancelled) return;
        const source = isEmergencyCategoryId(id) ? getGuide(id) : null;
        if (source === null) {
          setLoadState({ phase: "ready", baseline: null, warning });
          return;
        }
        const baseline: Baseline =
          loaded.guide !== null
            ? { guide: loaded.guide, source: "draft", updatedAt: loaded.updatedAt, hasDraft: true }
            : {
                guide: source,
                source: isPublished(id) ? "published" : "bundled",
                updatedAt: "",
                hasDraft: false,
              };
        setLoadState({ phase: "ready", baseline, warning });
      });

    return () => {
      cancelled = true;
    };
  }, [categoryId, refresh]);

  if (loadState.phase === "loading") {
    return (
      <Card title="Loading content" titleIcon="history">
        <p className={styles.boundaryNote} role="status">
          Loading the saved draft, published content and bundled fallback…
        </p>
      </Card>
    );
  }

  const baseline = loadState.baseline;
  if (baseline === null) {
    return (
      <Card title="Guide not found" titleIcon="alert">
        <p>
          The requested first-aid guide does not exist.{" "}
          <Link to="/admin/first-aid">Back to First-Aid Content</Link>.
        </p>
      </Card>
    );
  }

  const guide = baseline.guide;
  const current = draft ?? toDraft(guide);
  const activeErrors = errors ?? validateDraft(current);
  const dirty = isDirty(current, guide);

  const update = (mutate: (draft: GuideDraft) => GuideDraft): void => {
    setDraft(mutate(current));
    setErrors(null);
    setValidationNotice(null);
    if (operation.kind === "saved" || operation.kind === "failed" || operation.kind === "published") {
      setOperation({ kind: "idle" });
    }
  };

  const updateStep = (index: number, mutate: (step: StepDraft) => StepDraft): void => {
    update((d) => ({
      ...d,
      steps: d.steps.map((step, i) => (i === index ? mutate(step) : step)),
    }));
  };

  const setBaseline = (next: Baseline): void => {
    setLoadState((prev) => ({ ...prev, baseline: next }));
  };

  const handleValidate = (): void => {
    const nextErrors = validateDraft(current);
    setErrors(nextErrors);
    setValidationNotice(
      isDraftValid(nextErrors)
        ? "All fields pass validation — ready to save as a draft or publish."
        : "Some fields need attention before this guide can be saved or published.",
    );
  };

  const handleSave = (): void => {
    const nextErrors = validateDraft(current);
    setErrors(nextErrors);
    if (!isDraftValid(nextErrors)) {
      setOperation({
        kind: "failed",
        message: "Fix the highlighted fields before saving the draft.",
      });
      return;
    }
    const saved = fromDraft(current, guide);
    setOperation({ kind: "saving" });
    saveDraft(saved).then(
      () => {
        setBaseline({
          guide: saved,
          source: "draft",
          updatedAt: new Date().toISOString(),
          hasDraft: true,
        });
        setDraft(null);
        setErrors(null);
        setValidationNotice(null);
        setOperation({ kind: "saved", at: clockTime(new Date()) });
      },
      (error: unknown) => {
        // The draft state above is untouched — the admin's work survives.
        setOperation({ kind: "failed", message: messageOf(error) });
      },
    );
  };

  const handlePublish = (): void => {
    const nextErrors = validateDraft(current);
    setErrors(nextErrors);
    if (!isDraftValid(nextErrors)) {
      setOperation({
        kind: "failed",
        message: "Fix the highlighted fields before publishing.",
      });
      return;
    }
    const content = fromDraft(current, guide);
    setOperation({ kind: "publishing" });
    publishGuide(content).then(
      () =>
        refresh().then(() => {
          // The write succeeded, so the baseline IS the content we just
          // published — regardless of whether this instance's overlay
          // refresh succeeded (the public app reads the document directly).
          setBaseline({
            guide: content,
            source: "published",
            updatedAt: "",
            hasDraft: baseline.hasDraft,
          });
          setDraft(null);
          setErrors(null);
          setValidationNotice(null);
          setOperation({ kind: "published", at: clockTime(new Date()) });
        }),
      (error: unknown) => {
        setOperation({ kind: "failed", message: messageOf(error) });
      },
    );
  };

  const handleDiscardSavedDraft = (): void => {
    setConfirmingDiscardDraft(false);
    discardDraft(guide.id).then(
      () => {
        refresh().then(() => {
          const source = getGuide(guide.id);
          if (source !== null) {
            setBaseline({
              guide: source,
              source: isPublished(guide.id) ? "published" : "bundled",
              updatedAt: "",
              hasDraft: false,
            });
          }
          setDraft(null);
          setErrors(null);
          setValidationNotice(null);
          setOperation({ kind: "idle" });
        });
      },
      (error: unknown) => {
        setOperation({ kind: "failed", message: messageOf(error) });
      },
    );
  };

  const busy = operation.kind === "saving" || operation.kind === "publishing";
  const stepImageCount = current.steps.filter((step) => step.image.trim() !== "").length;

  const statusText =
    operation.kind === "saving"
      ? "Saving draft…"
      : operation.kind === "saved"
        ? `Draft saved at ${operation.at}.`
        : operation.kind === "publishing"
          ? "Publishing…"
          : operation.kind === "published"
            ? `Published at ${operation.at} — the public app now serves this content.`
            : operation.kind === "failed"
              ? undefined
              : validationNotice ?? (dirty ? "Unsaved edits stay on this device until you save." : undefined);

  return (
    <div className={styles.page}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link to="/admin/first-aid">First-Aid Content</Link>
        <span aria-hidden="true">/</span>
        <span>{guide.label}</span>
      </nav>

      <header className={styles.pageHeader}>
        <div>
          <h1>{current.label}</h1>
          <p className={styles.headerMeta}>
            Category <code>{guide.id}</code> · version {current.contentVersion}
          </p>
        </div>
        <div className={styles.headerBadges}>
          <Badge tone="blue" dot>
            {dirty ? "Unsaved local edits" : "No local edits"}
          </Badge>
          {baseline.source === "draft" ? (
            <Badge tone="amber" dot>
              Editing saved draft{baseline.updatedAt !== "" ? ` (${baseline.updatedAt.slice(0, 10)})` : ""}
            </Badge>
          ) : baseline.source === "published" ? (
            <Badge tone="success" dot>
              Published to Firebase
            </Badge>
          ) : (
            <Badge tone="neutral" dot>
              Bundled content — not published yet
            </Badge>
          )}
          {baseline.hasDraft && baseline.source !== "draft" && (
            <Badge tone="amber" dot>
              Extra draft copy saved
            </Badge>
          )}
          <Badge tone="amber" dot>
            Review pending
          </Badge>
        </div>
      </header>

      {loadState.warning !== null && (
        <p className={styles.warningNote} role="alert">
          {loadState.warning} Saving now will overwrite the saved draft if one exists.
        </p>
      )}

      <Card title="Draft & publish" titleIcon="history">
        <p className={styles.boundaryNote}>
          <strong>Save draft</strong> stores an admin-only working copy
          (firstAidDrafts) — the public app does not change.{" "}
          <strong>Publish</strong> writes the public document (firstAidGuides)
          with a server-generated timestamp, and the public app serves it from
          then on; until a guide is published, the public app serves the
          bundled fallback content. Provenance and review information are not
          editable here — they are set by the review process.
        </p>
        {baseline.hasDraft && !confirmingDiscardDraft && (
          <Button
            variant="outline"
            icon="close"
            onClick={() => setConfirmingDiscardDraft(true)}
            disabled={busy}
          >
            Discard saved draft
          </Button>
        )}
        {confirmingDiscardDraft && (
          <div className={styles.confirmRow}>
            <span>Discard the saved draft? Published and bundled content stay untouched.</span>
            <Button variant="danger" onClick={handleDiscardSavedDraft} disabled={busy}>
              Yes, discard draft
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingDiscardDraft(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        )}
      </Card>

      <div className={styles.actionBar}>
        <Button variant="outline" icon="check" onClick={handleValidate} disabled={busy}>
          Validate draft
        </Button>
        <Button
          variant="primary"
          icon="check"
          onClick={handleSave}
          disabled={busy || !dirty}
        >
          {operation.kind === "saving" ? "Saving…" : "Save draft"}
        </Button>
        <Button
          variant="success"
          icon="upload"
          onClick={handlePublish}
          disabled={busy}
        >
          {operation.kind === "publishing" ? "Publishing…" : "Publish"}
        </Button>
        <Button
          variant="ghost"
          icon="close"
          disabled={!dirty || busy}
          onClick={() => {
            setDraft(null);
            setErrors(null);
            setValidationNotice(null);
            setOperation({ kind: "idle" });
          }}
        >
          Discard edits
        </Button>
        <span className={styles.actionStatus} role="status">
          {statusText}
        </span>
        {operation.kind === "failed" && operation.message !== undefined && (
          <span className={styles.actionError} role="alert">
            {operation.message}
          </span>
        )}
      </div>

      {/* ------------------------------------------------ guide-level fields */}
      <Card title="Guide details" titleIcon="first-aid">
        <div className={styles.gridTwo}>
          <Field label="Label" htmlFor="guide-label" error={activeErrors.label}>
            <TextField
              id="guide-label"
              value={current.label}
              onChange={(value) => update((d) => ({ ...d, label: value }))}
            />
          </Field>
          <Field
            label="Content version"
            htmlFor="guide-version"
            hint="Bumped when the medical content changes."
            error={activeErrors.contentVersion}
          >
            <TextField
              id="guide-version"
              value={current.contentVersion}
              onChange={(value) => update((d) => ({ ...d, contentVersion: value }))}
            />
          </Field>
        </div>

        <Field label="Summary" htmlFor="guide-summary" error={activeErrors.summary}>
          <textarea
            id="guide-summary"
            className={styles.textarea}
            rows={3}
            value={current.summary}
            onChange={(event) => update((d) => ({ ...d, summary: event.target.value }))}
          />
        </Field>

        <div className={styles.gridTwo}>
          <Field
            label="Icon class"
            htmlFor="guide-icon"
            hint={`Presentation class, e.g. ${guide.iconClass}.`}
            error={activeErrors.iconClass}
          >
            <TextField
              id="guide-icon"
              value={current.iconClass}
              onChange={(value) => update((d) => ({ ...d, iconClass: value }))}
            />
          </Field>
          <Field
            label="Main image"
            htmlFor="guide-image"
            hint="Uploaded to Firebase Storage; bundled paths keep working as fallback."
            error={activeErrors.image}
          >
            <ImagePicker
              inputId="guide-image"
              value={current.image}
              folder={`images/guides/${guide.id}`}
              label="Main image"
              disabled={busy}
              onChange={(next) => update((d) => ({ ...d, image: next }))}
            />
          </Field>
        </div>
        {stepImageCount > 0 && (
          <p className={styles.mediaNote}>
            Media present: {stepImageCount} step image
            {stepImageCount === 1 ? "" : "s"} attached to protocol steps.
          </p>
        )}
      </Card>

      {/* ------------------------------------------------------ steps editor */}
      <Card title="Protocol steps" titleIcon="history">
        <p className={styles.sectionIntro}>
          The canonical sequence. Step text is what text-to-speech reads aloud.
          Image, alt text and warning are part of the application model.
        </p>
        {current.steps.map((step, index) => (
          <fieldset key={index} className={styles.stepCard}>
            <legend>Step {index + 1}</legend>
            <div className={styles.gridTwo}>
              <Field
                label="Title"
                htmlFor={`step-${index}-title`}
                error={activeErrors.steps[index]?.title}
              >
                <TextField
                  id={`step-${index}-title`}
                  value={step.title}
                  onChange={(value) =>
                    updateStep(index, (s) => ({ ...s, title: value }))
                  }
                />
              </Field>
              <Field
                label="Warning (optional)"
                htmlFor={`step-${index}-warning`}
                hint="Safety-critical caution shown with this step."
                error={activeErrors.steps[index]?.warning}
              >
                <TextField
                  id={`step-${index}-warning`}
                  value={step.warning}
                  onChange={(value) =>
                    updateStep(index, (s) => ({ ...s, warning: value }))
                  }
                />
              </Field>
            </div>
            <Field
              label="Instruction (spoken aloud)"
              htmlFor={`step-${index}-text`}
              error={activeErrors.steps[index]?.text}
            >
              <textarea
                id={`step-${index}-text`}
                className={styles.textarea}
                rows={2}
                value={step.text}
                onChange={(event) =>
                  updateStep(index, (s) => ({ ...s, text: event.target.value }))
                }
              />
            </Field>
            <Field
              label="Step image (optional)"
              htmlFor={`step-${index}-image`}
              hint="Choose a file from this device — it uploads to Firebase Storage when you confirm."
              error={activeErrors.steps[index]?.image}
            >
              <ImagePicker
                inputId={`step-${index}-image`}
                value={step.image}
                folder={`images/guides/${guide.id}`}
                label={`Step ${index + 1} image`}
                disabled={busy}
                onChange={(next) =>
                  updateStep(index, (s) => ({ ...s, image: next }))
                }
              />
            </Field>
            <Field
              label="Step image alt text (optional)"
              htmlFor={`step-${index}-imageAlt`}
              hint="Required whenever a step image is set."
              error={activeErrors.steps[index]?.imageAlt}
            >
              <TextField
                id={`step-${index}-imageAlt`}
                value={step.imageAlt}
                onChange={(value) =>
                  updateStep(index, (s) => ({ ...s, imageAlt: value }))
                }
              />
            </Field>
          </fieldset>
        ))}
      </Card>

      {/* ----------------------------------------------------- list sections */}
      <div className={styles.gridTwo}>
        <Card title="Do" titleIcon="check">
          <ListEditor
            label="Do items"
            items={current.dos}
            errors={activeErrors.dos}
            addLabel="Add Do item"
            onChange={(index, value) =>
              update((d) => ({
                ...d,
                dos: d.dos.map((item, i) => (i === index ? value : item)),
              }))
            }
            onAdd={() => update((d) => ({ ...d, dos: [...d.dos, ""] }))}
            onRemove={(index) =>
              update((d) => ({ ...d, dos: d.dos.filter((_, i) => i !== index) }))
            }
          />
        </Card>
        <Card title="Do not" titleIcon="alert">
          <ListEditor
            label="Do not items"
            items={current.donts}
            errors={activeErrors.donts}
            addLabel="Add Do-not item"
            onChange={(index, value) =>
              update((d) => ({
                ...d,
                donts: d.donts.map((item, i) => (i === index ? value : item)),
              }))
            }
            onAdd={() => update((d) => ({ ...d, donts: [...d.donts, ""] }))}
            onRemove={(index) =>
              update((d) => ({ ...d, donts: d.donts.filter((_, i) => i !== index) }))
            }
          />
        </Card>
      </div>

      <Card title="When to seek professional help" titleIcon="sos">
        <ListEditor
          label="Seek-help triggers"
          items={current.whenToSeekHelp}
          errors={activeErrors.whenToSeekHelp}
          addLabel="Add seek-help trigger"
          onChange={(index, value) =>
            update((d) => ({
              ...d,
              whenToSeekHelp: d.whenToSeekHelp.map((item, i) =>
                i === index ? value : item,
              ),
            }))
          }
          onAdd={() =>
            update((d) => ({ ...d, whenToSeekHelp: [...d.whenToSeekHelp, ""] }))
          }
          onRemove={(index) =>
            update((d) => ({
              ...d,
              whenToSeekHelp: d.whenToSeekHelp.filter((_, i) => i !== index),
            }))
          }
        />
      </Card>

      {/* ------------------------------------------------------- quick guide */}
      <Card title="Quick Guide" titleIcon="first-aid">
        <p className={styles.sectionIntro}>
          A compressed, explicitly stored presentation of the SAME protocol —
          never a second protocol. It must not introduce advice the steps do
          not contain.
        </p>
        <Field
          label="Immediate priority"
          htmlFor="qg-priority"
          error={activeErrors.quickGuidePriority}
        >
          <textarea
            id="qg-priority"
            className={styles.textarea}
            rows={2}
            value={current.quickGuide.immediatePriority}
            onChange={(event) =>
              update((d) => ({
                ...d,
                quickGuide: { ...d.quickGuide, immediatePriority: event.target.value },
              }))
            }
          />
        </Field>
        <div className={styles.gridTwo}>
          <ListEditor
            label="Essential actions"
            items={current.quickGuide.essentialActions}
            errors={activeErrors.quickGuideEssential}
            addLabel="Add essential action"
            onChange={(index, value) =>
              update((d) => ({
                ...d,
                quickGuide: {
                  ...d.quickGuide,
                  essentialActions: d.quickGuide.essentialActions.map((item, i) =>
                    i === index ? value : item,
                  ),
                },
              }))
            }
            onAdd={() =>
              update((d) => ({
                ...d,
                quickGuide: {
                  ...d.quickGuide,
                  essentialActions: [...d.quickGuide.essentialActions, ""],
                },
              }))
            }
            onRemove={(index) =>
              update((d) => ({
                ...d,
                quickGuide: {
                  ...d.quickGuide,
                  essentialActions: d.quickGuide.essentialActions.filter(
                    (_, i) => i !== index,
                  ),
                },
              }))
            }
          />
          <ListEditor
            label="Critical don'ts"
            items={current.quickGuide.criticalDonts}
            errors={activeErrors.quickGuideCriticalDonts}
            addLabel="Add critical don't"
            onChange={(index, value) =>
              update((d) => ({
                ...d,
                quickGuide: {
                  ...d.quickGuide,
                  criticalDonts: d.quickGuide.criticalDonts.map((item, i) =>
                    i === index ? value : item,
                  ),
                },
              }))
            }
            onAdd={() =>
              update((d) => ({
                ...d,
                quickGuide: {
                  ...d.quickGuide,
                  criticalDonts: [...d.quickGuide.criticalDonts, ""],
                },
              }))
            }
            onRemove={(index) =>
              update((d) => ({
                ...d,
                quickGuide: {
                  ...d.quickGuide,
                  criticalDonts: d.quickGuide.criticalDonts.filter(
                    (_, i) => i !== index,
                  ),
                },
              }))
            }
          />
        </div>
      </Card>

      {/* ------------------------------------------------------- provenance */}
      <Card title="Provenance & review" titleIcon="history">
        <p className={styles.sectionIntro}>
          Where this content comes from and who verified it. Set by the medical
          review process — not editable here.
        </p>
        <ul className={styles.provenanceList}>
          {guide.content.provenance.map((entry) => (
            <li key={entry.claim}>
              <strong>{entry.claim}</strong>
              <span>{entry.source}</span>
              {entry.verifiedAt !== "" && <span>Verified {entry.verifiedAt}</span>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
