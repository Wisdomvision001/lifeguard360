/**
 * Address composition (Slice 1 — offline discovery core).
 *
 * Two concepts:
 *  A. `addressRaw` — the verbatim `addr:*` tags as they exist in OSM.
 *  B. `addressCandidate` — a human-readable string composed ONLY from actual
 *     `addr:*` component values, most-specific-first.
 *
 * Never fabricates: missing components are skipped, not invented. If no
 * `addr:*` tags exist at all, the candidate is null. No reverse geocoding,
 * no Nominatim, no coordinate inference — ever.
 */

/** Composition order: most-specific-first (matches docs/DATASET-CONTRACT.md §9 convention). */
export const ADDRESS_COMPONENT_ORDER: readonly string[] = [
  "addr:housenumber",
  "addr:street",
  "addr:suburb",
  "addr:city",
  "addr:state",
  "addr:postcode",
  "addr:country",
];

/** Returns the subset of tags whose keys start with "addr:", verbatim (unmodified values). */
export function extractAddressRaw(tags: Record<string, unknown> | null | undefined): Record<string, string> | null {
  if (tags === null || tags === undefined) return null;
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (key.startsWith("addr:") && typeof value === "string") {
      raw[key] = value;
    }
  }
  return Object.keys(raw).length > 0 ? raw : null;
}

/**
 * Composes the human-readable address candidate from `addr:*` tags only.
 * Components are joined most-specific-first, comma-separated, single spaces
 * around separators. Values are trimmed for joining but never altered
 * otherwise. Empty/whitespace-only components are treated as absent.
 * Returns null when no usable address component exists.
 */
export function composeAddressCandidate(tags: Record<string, unknown> | null | undefined): string | null {
  const parts: string[] = [];
  for (const key of ADDRESS_COMPONENT_ORDER) {
    const value = tags?.[key];
    if (typeof value === "string" && value.trim() !== "") {
      parts.push(value.trim());
    }
  }
  return parts.length > 0 ? parts.join(", ") : null;
}
