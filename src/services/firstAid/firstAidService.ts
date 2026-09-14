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
 * FirstAidService (Phase 3): serves first-aid content from the bundled,
 * versioned dataset. Offline by construction — a Firestore content source can
 * layer on top later without changing callers.
 *
 * Users only ever consume `published` content. The bundled dataset carries
 * `contentVersion` and provenance; nothing here presents unreviewed content
 * as clinically approved (see data/firstAid.ts header).
 */

export function getAllGuides(): FirstAidGuide[] {
  return Object.values(FIRST_AID_GUIDES);
}

export function getGuide(id: string): FirstAidGuide | null {
  return isEmergencyCategoryId(id) ? FIRST_AID_GUIDES[id] : null;
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
