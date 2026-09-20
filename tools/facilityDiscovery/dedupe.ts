/**
 * Advisory duplicate detection (Slice 1 — offline discovery core).
 *
 * Flags likely duplicates between candidates for HUMAN review. Never merges,
 * never deletes, never mutates candidates. All flags carry the evidence
 * (distance + reason) so a reviewer can judge without re-measuring.
 */

export type DuplicateFlagType = "EXACT_OSM_IDENTITY" | "PROBABLE_DUPLICATE" | "POSSIBLE_SAME_SITE" | "NAME_VARIANT";

export interface DuplicateFlag {
  type: DuplicateFlagType;
  candidateAId: string;
  candidateBId: string;
  /** Great-circle distance in metres (haversine). */
  distanceMeters: number;
  reason: string;
}

/** Small pure Haversine helper local to the discovery tooling. */
export function haversineMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6_371_000;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Same-element duplicates (same type + id) collapse to one canonical candidate. */
export function collapseExactIdentity(candidates: readonly CandidateLike[]): {
  canonical: CandidateLike[];
  flags: DuplicateFlag[];
} {
  const byIdentity = new Map<string, CandidateLike>();
  const flags: DuplicateFlag[] = [];
  for (const candidate of candidates) {
    const existing = byIdentity.get(candidate.candidateId);
    if (existing === undefined) {
      byIdentity.set(candidate.candidateId, candidate);
      continue;
    }
    // Same candidateId: keep the highest OSM version deterministically; tie → first seen.
    const a = existing.osm?.version ?? 0;
    const b = candidate.osm?.version ?? 0;
    if (b > a) byIdentity.set(candidate.candidateId, candidate);
    flags.push({
      type: "EXACT_OSM_IDENTITY",
      candidateAId: existing.candidateId,
      candidateBId: candidate.candidateId,
      distanceMeters: 0,
      reason: "identical OSM element appeared more than once; canonical entry retains the highest OSM version",
    });
  }
  return { canonical: [...byIdentity.values()], flags };
}

/** Minimal structural view of a candidate needed for flagging (keeps this module decoupled). */
export interface CandidateLike {
  candidateId: string;
  name: string | null;
  coordinates: { latitude: number; longitude: number };
  osm?: { version: number | null };
}

const SAME_SITE_MAX_METERS = 25;
const PROBABLE_DUPLICATE_MAX_METERS = 50;
const NAME_VARIANT_MAX_METERS = 150;

/** Lowercase, trim, strip punctuation, collapse whitespace, strip diacritics — comparison only. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Advisory duplicate flags across distinct candidates (exact identity should
 * already be collapsed by the caller via collapseExactIdentity). Order-stable:
 * pairs are emitted in candidate order; each pair receives the single
 * most-specific applicable flag (same-site > probable duplicate > name variant).
 */
export function flagDuplicates(candidates: readonly CandidateLike[]): DuplicateFlag[] {
  const flags: DuplicateFlag[] = [];

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      const distanceMeters = haversineMeters(a.coordinates, b.coordinates);

      const nameA = a.name === null ? null : normalizeName(a.name);
      const nameB = b.name === null ? null : normalizeName(b.name);
      const sameName = nameA !== null && nameA === nameB;

      if (distanceMeters <= SAME_SITE_MAX_METERS) {
        flags.push({
          type: "POSSIBLE_SAME_SITE",
          candidateAId: a.candidateId,
          candidateBId: b.candidateId,
          distanceMeters,
          reason: sameName
            ? `elements are ${Math.round(distanceMeters)} m apart with the same normalized name`
            : `elements are only ${Math.round(distanceMeters)} m apart (may be node/way representations of one site)`,
        });
      } else if (sameName && distanceMeters <= PROBABLE_DUPLICATE_MAX_METERS) {
        flags.push({
          type: "PROBABLE_DUPLICATE",
          candidateAId: a.candidateId,
          candidateBId: b.candidateId,
          distanceMeters,
          reason: `same normalized name ${Math.round(distanceMeters)} m apart`,
        });
      } else if (sameName && distanceMeters <= NAME_VARIANT_MAX_METERS) {
        flags.push({
          type: "NAME_VARIANT",
          candidateAId: a.candidateId,
          candidateBId: b.candidateId,
          distanceMeters,
          reason: `same normalized name ${Math.round(distanceMeters)} m apart — possible rename/upgrade or two elements of one facility`,
        });
      }
      // Distinct distant facilities (and different-name pairs beyond 25 m)
      // are intentionally NOT flagged.
    }
  }
  return flags;
}
