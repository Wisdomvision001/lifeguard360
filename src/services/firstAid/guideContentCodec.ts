import {
  isEmergencyCategoryId,
  type EmergencyCategoryId,
  type FirstAidGuide,
  type GuideProvenance,
  type GuideStep,
  type QuickGuide,
} from "@/types";

/**
 * Guide content codec — the single conversion point between Firestore guide
 * documents and the application's FirstAidGuide model.
 *
 * Document shapes (mirroring firebase/firestore.rules EXACTLY):
 *
 *   firstAidGuides/{id} = { ...body, publishedAt }   (published — public read)
 *   firstAidDrafts/{id} = { ...body, updatedAt }     (draft — admin read only)
 *
 *   body = { id, label, summary, iconClass, image?, content, provenance }
 *
 * The READ side (docToGuide) is strict and total: any document that does not
 * satisfy the application model returns null and the caller falls back to the
 * bundled dataset — a malformed document can never break the public app or
 * present unvalidated content. The WRITE side (guideToDoc) produces exactly
 * the body the rules accept; timestamps are added by the admin services with
 * serverTimestamp() so clients never choose them.
 *
 * The envelope keys the rules tolerate but the CMS cannot represent
 * (content.variants, content.video, content.reviewedBy, content.reviewedAt)
 * are rejected on read: the editor draft model round-trips only the bundled
 * core fields, so a document carrying them did not come from this CMS.
 */

export interface GuideDocBody {
  id: string;
  label: string;
  summary: string;
  iconClass: string;
  image?: string;
  content: FirstAidGuide["content"];
  provenance: GuideProvenance[];
}

type GuideContent = FirstAidGuide["content"];

// ------------------------------------------------------------------ helpers

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

/** Optional string field: absent, or a string within the bound. */
function isOptionalString(value: unknown, max: number): boolean {
  return value === undefined || (typeof value === "string" && value.length <= max);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isGuideProvenanceList(value: unknown): value is GuideProvenance[] {
  return (
    Array.isArray(value) &&
    value.length <= 50 &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.claim === "string" &&
        typeof entry.source === "string" &&
        typeof entry.verifiedAt === "string",
    )
  );
}

/** GuideStep exactly as firebase/rules isValidGuideStep validates it. */
function isGuideStep(value: unknown): value is GuideStep {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  const allowed = new Set(["title", "text", "image", "imageAlt", "warning"]);
  if (!keys.includes("title") || !keys.includes("text")) return false;
  if (keys.some((key) => !allowed.has(key))) return false;
  if (!isBoundedString(value.title, 1, 120)) return false;
  if (!isBoundedString(value.text, 1, 2000)) return false;
  if (!isOptionalString(value.image, 512)) return false;
  if (!isOptionalString(value.imageAlt, 300)) return false;
  if (!isOptionalString(value.warning, 500)) return false;
  return true;
}

function isQuickGuide(value: unknown): value is QuickGuide {
  return (
    isRecord(value) &&
    Object.keys(value).length === 3 &&
    typeof value.immediatePriority === "string" &&
    value.immediatePriority.length >= 1 &&
    value.immediatePriority.length <= 2000 &&
    isStringArray(value.essentialActions) &&
    isStringArray(value.criticalDonts)
  );
}

/** Content body exactly as isValidGuideContent validates it (core keys only). */
function isGuideContent(value: unknown): value is GuideContent {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = [
    "contentVersion",
    "summary",
    "steps",
    "dos",
    "donts",
    "whenToSeekHelp",
    "quickGuide",
    "provenance",
  ].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    return false;
  }
  return (
    isBoundedString(value.contentVersion, 1, 40) &&
    isBoundedString(value.summary, 1, 2000) &&
    Array.isArray(value.steps) &&
    value.steps.length >= 1 &&
    value.steps.every(isGuideStep) &&
    isStringArray(value.dos) &&
    isStringArray(value.donts) &&
    isStringArray(value.whenToSeekHelp) &&
    isQuickGuide(value.quickGuide) &&
    isGuideProvenanceList(value.provenance)
  );
}

// ---------------------------------------------------------------- read side

/**
 * Convert a Firestore document (draft or published — same body) into the
 * application model. Returns null when the document does not satisfy the
 * application model, so callers fall back to bundled content instead of
 * serving anything unvalidated.
 */
export function guideDocToGuide(docId: string, data: unknown): FirstAidGuide | null {
  if (!isEmergencyCategoryId(docId) || !isRecord(data)) return null;
  if (data.id !== docId) return null;
  if (!isBoundedString(data.label, 1, 80)) return null;
  if (!isBoundedString(data.summary, 1, 2000)) return null;
  if (typeof data.iconClass !== "string" || data.iconClass.length > 80) return null;
  if (!isOptionalString(data.image, 512)) return null;
  if (data.provenance !== undefined && !isGuideProvenanceList(data.provenance)) return null;
  if (!isGuideContent(data.content)) return null;

  const content: GuideContent = data.content;
  const guide: FirstAidGuide = {
    id: docId as EmergencyCategoryId,
    label: data.label,
    summary: data.summary,
    iconClass: data.iconClass,
    content,
  };
  if (typeof data.image === "string") {
    guide.image = data.image;
  }
  return guide;
}

// ---------------------------------------------------------------- write side

/**
 * Serialise a guide (or draft — same body) into the exact document body the
 * Firestore rules accept. Timestamps (publishedAt/updatedAt) are deliberately
 * NOT part of this body: the admin services add them with serverTimestamp()
 * so a client can never choose them.
 */
export function guideToDoc(guide: FirstAidGuide): GuideDocBody {
  const doc: GuideDocBody = {
    id: guide.id,
    label: guide.label,
    summary: guide.summary,
    iconClass: guide.iconClass,
    content: guide.content,
    // Doc-level provenance mirrors the content-level provenance the bundled
    // dataset carries (the rules require the key; duplicating the same list
    // keeps one source of truth for reviewers).
    provenance: guide.content.provenance,
  };
  if (guide.image !== undefined) {
    doc.image = guide.image;
  }
  return doc;
}

/**
 * Validate a guide before any write: round-trips through the read-side codec
 * so the app can never send a document it would itself refuse to read.
 * Returns an honest error message, or null when the guide is writeable.
 */
export function validateGuideForWrite(guide: FirstAidGuide): string | null {
  const doc = guideToDoc(guide);
  if (guideDocToGuide(doc.id, doc) === null) {
    return "This guide does not fit the saved content model — fix the highlighted fields before saving.";
  }
  return null;
}
