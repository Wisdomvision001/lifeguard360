import { FIRST_AID_GUIDES } from "@/data/firstAid";
import {
  isEmergencyCategoryId,
  type EmergencyCategoryId,
  type FirstAidGuide,
  type FirstAidGuideVersion,
  type GuideStep,
  type QuickGuide,
} from "@/types";

/**
 * FirstAidService: serves first-aid content from a MERGED store.
 *
 * Source precedence per category (Phase 6 fallback architecture):
 *
 *   published Firestore document (validated by guideContentCodec)
 *     ?? bundled versioned dataset
 *
 * The overlay is populated once per refresh by FirstAidContentProvider; every
 * caller keeps reading synchronously through getGuide()/getAllGuides() with
 * no code changes. When Firestore is unavailable or a document fails
 * validation, the bundled dataset stays served — the public app never breaks
 * and never shows unvalidated content. The bundled dataset itself is never
 * deleted (offline-first + fallback guarantee).
 *
 * Users only ever consume `published` content. The bundled dataset carries
 * `contentVersion` and provenance; nothing here presents unreviewed content
 * as clinically approved (see data/firstAid.ts header).
 */

/** Validated published guides keyed by category; empty before first refresh. */
const publishedOverlay = new Map<EmergencyCategoryId, FirstAidGuide>();

/** Replace the published overlay after a successful Firestore read. */
export function applyPublishedGuides(guides: FirstAidGuide[]): void {
  publishedOverlay.clear();
  for (const guide of guides) {
    publishedOverlay.set(guide.id, guide);
  }
}

/** Drop all published content (test hygiene / return to bundled-only state). */
export function resetPublishedGuides(): void {
  publishedOverlay.clear();
}

/** True when a validated Firestore document currently overrides the bundle. */
export function isPublished(id: string): boolean {
  return isEmergencyCategoryId(id) && publishedOverlay.has(id);
}

export function getAllGuides(): FirstAidGuide[] {
  return Object.values(FIRST_AID_GUIDES).map(
    (guide) => publishedOverlay.get(guide.id) ?? guide,
  );
}

export function getGuide(id: string): FirstAidGuide | null {
  if (!isEmergencyCategoryId(id)) return null;
  return publishedOverlay.get(id) ?? FIRST_AID_GUIDES[id];
}

/** The canonical protocol steps of a guide. */
export function getSteps(guide: FirstAidGuide): GuideStep[] {
  return guide.content.steps;
}

/** A single canonical step by 1-based number, or null when out of range. */
export function getStep(guide: FirstAidGuide, stepNumber: number): GuideStep | null {
  return guide.content.steps[stepNumber - 1] ?? null;
}

/** Flattened speakable text for one structured step. */
export function stepToSpeechText(step: GuideStep, stepNumber: number): string {
  return [`Step ${stepNumber}. ${step.title}.`, step.text].join(" ");
}

/**
 * The explicitly stored Quick Guide presentation of the canonical protocol.
 * No runtime summarisation: quick guide content is authored beside the steps
 * in data/firstAid.ts so a reviewer can verify it introduces no different
 * medical advice.
 */
export function buildQuickGuide(guide: FirstAidGuide): QuickGuide {
  return guide.content.quickGuide;
}

/** Flatten a guide into speakable text for TTS. */
export function guideToSpeechText(guide: FirstAidGuide): string {
  const c = guide.content;
  return [
    `${guide.label}. ${c.summary}`,
    "Steps:",
    ...c.steps.map((step, index) => stepToSpeechText(step, index + 1)),
    "Do:",
    ...c.dos,
    "Do not:",
    ...c.donts,
    "Seek professional help if:",
    ...c.whenToSeekHelp,
  ].join(" ");
}

/** Compile-time exhaustiveness guard over the six categories. */
export function assertAllCategoriesCovered(handlers: Record<EmergencyCategoryId, unknown>): void {
  void handlers;
}

export type { FirstAidGuideVersion };
