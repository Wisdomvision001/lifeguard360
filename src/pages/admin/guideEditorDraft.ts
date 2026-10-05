import type { FirstAidGuide, QuickGuide } from "@/types";

/**
 * Guide-editor draft model (Admin CMS phase).
 *
 * PERSISTENCE: this module models the editable draft; persistence happens
 * through AdminGuideEditorPage → adminGuideService (draft: firstAidDrafts,
 * publish: firstAidGuides). Nothing in this module talks to the network.
 *
 * SCHEMA: the draft is the APPLICATION model (steps = { title, text, image?,
 * imageAlt?, warning? }) and is RECONCILED with firebase/firestore.rules —
 * validation below mirrors the rules bounds exactly (title ≤120, text ≤2000,
 * image ≤512 for Storage download URLs, imageAlt ≤300, warning ≤500), so a
 * draft that validates here is accepted by the rules. The rules remain the
 * authoritative boundary; this is UX guidance only.
 */

export interface StepDraft {
  title: string;
  text: string;
  image: string;
  imageAlt: string;
  warning: string;
}

export interface GuideDraft {
  label: string;
  summary: string;
  iconClass: string;
  image: string;
  contentVersion: string;
  steps: StepDraft[];
  dos: string[];
  donts: string[];
  whenToSeekHelp: string[];
  quickGuide: {
    immediatePriority: string;
    essentialActions: string[];
    criticalDonts: string[];
  };
}

/** Initialise the draft from the authoritative bundled guide. */
export function toDraft(guide: FirstAidGuide): GuideDraft {
  return {
    label: guide.label,
    // The dataset stores one summary that feeds both the doc-level summary and
    // content.summary (see makeGuide in data/firstAid.ts).
    summary: guide.summary,
    iconClass: guide.iconClass,
    image: guide.image ?? "",
    contentVersion: guide.content.contentVersion,
    steps: guide.content.steps.map((step) => ({
      title: step.title,
      text: step.text,
      image: step.image ?? "",
      imageAlt: step.imageAlt ?? "",
      warning: step.warning ?? "",
    })),
    dos: [...guide.content.dos],
    donts: [...guide.content.donts],
    whenToSeekHelp: [...guide.content.whenToSeekHelp],
    quickGuide: {
      immediatePriority: guide.content.quickGuide.immediatePriority,
      essentialActions: [...guide.content.quickGuide.essentialActions],
      criticalDonts: [...guide.content.quickGuide.criticalDonts],
    } satisfies Pick<QuickGuide, "immediatePriority" | "essentialActions" | "criticalDonts">,
  };
}

/** True when the draft differs from the guide it was initialised from. */
export function isDirty(draft: GuideDraft, guide: FirstAidGuide): boolean {
  return JSON.stringify(draft) !== JSON.stringify(toDraft(guide));
}

export interface ListFieldErrors {
  /** Per-item error, undefined where the item is acceptable. */
  items: (string | undefined)[];
  /** Whole-list error (e.g. a list that must not be empty). */
  list?: string;
}

export interface GuideDraftErrors {
  label?: string;
  summary?: string;
  iconClass?: string;
  image?: string;
  contentVersion?: string;
  steps: { title?: string; text?: string; image?: string; imageAlt?: string; warning?: string }[];
  dos: ListFieldErrors;
  donts: ListFieldErrors;
  whenToSeekHelp: ListFieldErrors;
  quickGuidePriority?: string;
  quickGuideEssential: ListFieldErrors;
  quickGuideCriticalDonts: ListFieldErrors;
}

const clean = (value: string): string => value.trim();

/**
 * Client-side validation mirroring the published constraints (rules lengths
 * where they exist; explicit sanity caps where the rules phase has not yet
 * caught up with the step media fields). This is UX guidance only — the
 * Firestore rules remain the authoritative boundary.
 */
export function validateDraft(draft: GuideDraft): GuideDraftErrors {
  const stepErrors = draft.steps.map((step) => ({
    title:
      clean(step.title) === ""
        ? "A step title is required."
        : step.title.length > 120
          ? "Step titles are limited to 120 characters."
          : undefined,
    text:
      clean(step.text) === ""
        ? "A step instruction is required."
        : step.text.length > 2000
          ? "Step instructions are limited to 2000 characters."
          : undefined,
    image:
      step.image.length > 512 ? "Image references are limited to 512 characters." : undefined,
    imageAlt:
      step.imageAlt.length > 300 ? "Alt text is limited to 300 characters." : undefined,
    warning:
      step.warning.length > 500 ? "Warnings are limited to 500 characters." : undefined,
  }));

  const listErrors = (items: string[], allowEmpty: boolean): ListFieldErrors => ({
    items: items.map((item) =>
      clean(item) === "" ? "Empty items are not allowed — remove or fill this item." : undefined,
    ),
    list:
      items.length === 0 && !allowEmpty
        ? "Add at least one item."
        : undefined,
  });

  return {
    label:
      clean(draft.label) === ""
        ? "A guide label is required."
        : draft.label.length > 80
          ? "Labels are limited to 80 characters."
          : undefined,
    summary:
      clean(draft.summary) === ""
        ? "A summary is required."
        : draft.summary.length > 2000
          ? "Summaries are limited to 2000 characters."
          : undefined,
    iconClass:
      draft.iconClass.length > 80 ? "Icon classes are limited to 80 characters." : undefined,
    image:
      draft.image.length > 512 ? "Image references are limited to 512 characters." : undefined,
    contentVersion:
      clean(draft.contentVersion) === ""
        ? "A content version is required."
        : draft.contentVersion.length > 40
          ? "Content versions are limited to 40 characters."
          : undefined,
    steps: stepErrors,
    dos: listErrors(draft.dos, false),
    donts: listErrors(draft.donts, false),
    whenToSeekHelp: listErrors(draft.whenToSeekHelp, false),
    quickGuidePriority:
      clean(draft.quickGuide.immediatePriority) === ""
        ? "An immediate priority is required."
        : draft.quickGuide.immediatePriority.length > 2000
          ? "The immediate priority is limited to 2000 characters."
          : undefined,
    quickGuideEssential: listErrors(draft.quickGuide.essentialActions, false),
    quickGuideCriticalDonts: listErrors(draft.quickGuide.criticalDonts, false),
  };
}

/**
 * Rebuild the authoritative guide from a validated draft. `template`
 * supplies what the draft deliberately does not carry (id, iconClass is in
 * the draft, and provenance/review metadata are display-only and preserved
 * verbatim). Empty optional strings are dropped so the document matches the
 * shape firebase/firestore.rules accepts.
 */
export function fromDraft(draft: GuideDraft, template: FirstAidGuide): FirstAidGuide {
  return {
    id: template.id,
    label: draft.label,
    summary: draft.summary,
    iconClass: draft.iconClass,
    ...(draft.image !== "" && { image: draft.image }),
    content: {
      // Preserves provenance (and any review metadata) from the template —
      // the draft never fabricates review state.
      ...template.content,
      contentVersion: draft.contentVersion,
      summary: draft.summary,
      steps: draft.steps.map((step) => ({
        title: step.title,
        text: step.text,
        ...(step.image !== "" && { image: step.image }),
        ...(step.imageAlt !== "" && { imageAlt: step.imageAlt }),
        ...(step.warning !== "" && { warning: step.warning }),
      })),
      dos: [...draft.dos],
      donts: [...draft.donts],
      whenToSeekHelp: [...draft.whenToSeekHelp],
      quickGuide: {
        immediatePriority: draft.quickGuide.immediatePriority,
        essentialActions: [...draft.quickGuide.essentialActions],
        criticalDonts: [...draft.quickGuide.criticalDonts],
      },
    },
  };
}

/** True when every field passes validation. */
export function isDraftValid(errors: GuideDraftErrors): boolean {
  const listOk = (l: ListFieldErrors): boolean =>
    l.list === undefined && l.items.every((item) => item === undefined);
  return (
    errors.label === undefined &&
    errors.summary === undefined &&
    errors.iconClass === undefined &&
    errors.image === undefined &&
    errors.contentVersion === undefined &&
    errors.quickGuidePriority === undefined &&
    errors.steps.every(
      (step) =>
        step.title === undefined &&
        step.text === undefined &&
        step.image === undefined &&
        step.imageAlt === undefined &&
        step.warning === undefined,
    ) &&
    listOk(errors.dos) &&
    listOk(errors.donts) &&
    listOk(errors.whenToSeekHelp) &&
    listOk(errors.quickGuideEssential) &&
    listOk(errors.quickGuideCriticalDonts)
  );
}
