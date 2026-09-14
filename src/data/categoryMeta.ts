import type { EmergencyCategoryId } from "@/types";

/**
 * Presentation metadata per emergency category — the colour coding from the
 * approved design mockups. Classes are defined in src/styles/global.css.
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
};
