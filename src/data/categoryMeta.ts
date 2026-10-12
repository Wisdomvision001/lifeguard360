import type { EmergencyCategoryId, ProspectiveEmergencyCategoryId } from "@/types";

/**
 * Presentation metadata per emergency category — the colour coding from the
 * approved design mockups. Classes are defined in src/styles/global.css.
 *
 * The first six categories keep their approved colours. New categories reuse
 * a conservative default tone until their own approved colour is assigned.
 */
export const CATEGORY_META: Record<
  EmergencyCategoryId,
  { toneClass: string }
> = {
  burns: { toneClass: "tone-red" },
  bleeding: { toneClass: "tone-red" },
  choking: { toneClass: "tone-blue" },
  "snake-bite": { toneClass: "tone-green" },
  "road-accident": { toneClass: "tone-purple" },
  fractures: { toneClass: "tone-amber" },
  cpr: { toneClass: "tone-red" },
};

/**
 * Presentation metadata for prospective (not-yet-bundled) categories.
 * Preserved here so the tone assignments are not lost when the bundled
 * `CATEGORY_META` is narrowed to the categories that actually have guides.
 * Enable a prospective category by adding its guide to `FIRST_AID_GUIDES`,
 * moving its entry from this map into `CATEGORY_META`, and adding it to
 * `EMERGENCY_CATEGORY_IDS`.
 *
 * The five forward-looking categories (anaphylaxis, heart-attack, stroke,
 * poisoning, drowning) are listed first; they already have colour
 * assignments and are the next candidates for bundled guides.
 */
export const PROSPECTIVE_CATEGORY_META: Record<
  ProspectiveEmergencyCategoryId,
  { toneClass: string }
> = {
  anaphylaxis: { toneClass: "tone-red" },
  "heart-attack": { toneClass: "tone-red" },
  stroke: { toneClass: "tone-red" },
  poisoning: { toneClass: "tone-purple" },
  drowning: { toneClass: "tone-blue" },
  asthma: { toneClass: "tone-blue" },
  seizures: { toneClass: "tone-red" },
  fainting: { toneClass: "tone-amber" },
  "diabetic-emergency": { toneClass: "tone-amber" },
  "electric-shock": { toneClass: "tone-yellow" },
  "head-injury": { toneClass: "tone-amber" },
  "spinal-injury": { toneClass: "tone-amber" },
  hypothermia: { toneClass: "tone-blue" },
  "heat-emergency": { toneClass: "tone-orange" },
  "eye-injury": { toneClass: "tone-blue" },
  "nosebleeds": { toneClass: "tone-amber" },
  "animal-bites": { toneClass: "tone-green" },
  "wounds-and-cuts": { toneClass: "tone-green" },
  "sprains-and-strains": { toneClass: "tone-green" },
  "dislocated-joints": { toneClass: "tone-green" },
  dehydration: { toneClass: "tone-orange" },
  "pregnancy-emergencies": { toneClass: "tone-purple" },
  "childbirth-emergencies": { toneClass: "tone-purple" },
  shock: { toneClass: "tone-red" },
  "allergic-reactions": { toneClass: "tone-amber" },
  "insect-stings-and-bites": { toneClass: "tone-green" },
  "chemical-exposure": { toneClass: "tone-yellow" },
  "smoke-inhalation": { toneClass: "tone-grey" },
  "foreign-objects": { toneClass: "tone-amber" },
};
