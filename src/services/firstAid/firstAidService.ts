import { FIRST_AID_GUIDES } from "@/data/firstAid";
import {
  isEmergencyCategoryId,
  type EmergencyCategoryId,
  type FirstAidGuide,
  type FirstAidGuideVersion,
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

/** Flatten a guide into speakable text for TTS. */
export function guideToSpeechText(guide: FirstAidGuide): string {
  const c = guide.content;
  return [
    `${guide.label}. ${c.summary}`,
    "Steps:",
    ...c.steps.map((step, index) => `Step ${index + 1}. ${step}`),
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
