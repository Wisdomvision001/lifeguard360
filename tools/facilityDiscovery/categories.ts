/**
 * Advisory category mapping (Slice 1 — offline discovery core).
 *
 * Maps preserved OSM tags to an advisory `categorySuggestion` for human review.
 * This is a SUGGESTION ONLY — it never determines `verified` (candidates have
 * no verification concept at all) and never overrides human curation.
 *
 * The parser preserves the original OSM tags verbatim so a reviewer can always
 * re-examine the basis (e.g. Ajiua Health Centre: OSM amenity=clinic, curated
 * as health-centre from its own name).
 */

export type CategorySuggestion = "hospital" | "clinic" | "pharmacy" | "health-centre" | "unknown";

/** OSM tag keys whose values participate in the advisory mapping. */
const MAPPED_TAG_KEYS: readonly string[] = ["amenity", "healthcare"];

/** Precedence-ordered advisory rules (first matching rule wins). */
const RULES: readonly { tag: string; value: string; suggestion: CategorySuggestion }[] = [
  { tag: "amenity", value: "hospital", suggestion: "hospital" },
  { tag: "amenity", value: "clinic", suggestion: "clinic" },
  { tag: "amenity", value: "pharmacy", suggestion: "pharmacy" },
  { tag: "amenity", value: "doctors", suggestion: "clinic" },
  { tag: "healthcare", value: "pharmacy", suggestion: "pharmacy" },
  { tag: "healthcare", value: "clinic", suggestion: "clinic" },
  { tag: "healthcare", value: "centre", suggestion: "health-centre" },
];

export interface CategoryInput {
  amenity?: string;
  healthcare?: string;
}

/**
 * Derives the advisory category suggestion from OSM tags.
 * Unmapped/ambiguous/absent combinations → "unknown".
 * Case-insensitive on tag values (OSM values are conventionally lowercase,
 * but the mapping must not silently miss capitalized variants).
 */
export function suggestCategory(tags: Record<string, unknown> | null | undefined): CategorySuggestion {
  if (tags === null || tags === undefined) return "unknown";

  const amenity = typeof tags.amenity === "string" ? tags.amenity.trim().toLowerCase() : undefined;
  const healthcare = typeof tags.healthcare === "string" ? tags.healthcare.trim().toLowerCase() : undefined;

  for (const rule of RULES) {
    const tagValue = rule.tag === "amenity" ? amenity : healthcare;
    if (tagValue === rule.value) return rule.suggestion;
  }

  // A healthcare value we do not recognize is still advisory-unknown, not a guess.
  return "unknown";
}

/** Tag keys the parser must preserve verbatim (superset of the mapped ones). */
export const PRESERVED_TAG_KEYS: readonly string[] = [
  ...MAPPED_TAG_KEYS,
  "emergency",
  "operator",
  "phone",
  "contact:phone",
  "opening_hours",
];
