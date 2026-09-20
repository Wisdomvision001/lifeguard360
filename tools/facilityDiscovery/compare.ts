/**
 * Curated-data comparison (Slice 1 — offline discovery core).
 *
 * Read-only comparison of discovered candidates against existing curated
 * facility records. Pure functions only — no writes, no Firebase, no
 * facilityService/seedFacilities calls. Results are advisory review items.
 */

import { haversineMeters, normalizeName } from "./dedupe.ts";

export type ComparisonStatus = "KNOWN_EXACT" | "KNOWN_PROBABLE" | "NEW" | "CHANGED_INFO";

export interface CuratedRecordView {
  /** Production deterministic document id, when derivable. */
  documentId?: string;
  name: string;
  coordinates: { latitude: number; longitude: number };
  phone?: string;
  openingHours?: string;
  address?: string;
  /** The record's provenance string — scanned for OSM element references. */
  source: string;
}

export interface ComparisonFinding {
  candidateId: string;
  status: ComparisonStatus;
  /** Curated record the candidate matched, when one matched. */
  matchedDocumentId: string | null;
  /** Fields where candidate and curated record differ (CHANGED_INFO only). */
  changedFields: string[];
  reason: string;
}

/** Minimal structural view of a candidate needed for comparison. */
export interface CandidateView {
  candidateId: string;
  name: string | null;
  coordinates: { latitude: number; longitude: number };
  phone: string | null;
  openingHours: string | null;
  addressCandidate: string | null;
  /** OSM identity for provenance-reference matching. */
  osmType: "node" | "way" | "relation";
  osmId: number;
  /** Production deterministic id, when the caller pre-derived one (optional). */
  documentId?: string;
}

export interface ComparisonOptions {
  /** Distance threshold for normalized-name probable matches (metres). */
  probableRadiusMeters?: number;
  /** Distance threshold for an OSM-reference match to count as the same facility. */
  exactRadiusMeters?: number;
}

const DEFAULT_PROBABLE_RADIUS_METERS = 150;
const DEFAULT_EXACT_RADIUS_METERS = 200;

/** Extracts OSM element references (node/way/relation + numeric id) from a provenance string. */
export function extractOsmReferences(source: string): { type: string; id: number }[] {
  const references: { type: string; id: number }[] = [];
  const pattern = /\b(node|way|relation)\/(\d+)\b/g;
  for (const match of source.matchAll(pattern)) {
    references.push({ type: match[1], id: Number.parseInt(match[2], 10) });
  }
  return references;
}

/**
 * Compares candidates against curated records (read-only).
 *
 * Matching strategies, in order:
 *  1. OSM element reference in curated provenance (+ within exactRadius) → KNOWN_EXACT
 *  2. Deterministic document id match → KNOWN_EXACT
 *  3. Normalized name + distance ≤ probableRadius → KNOWN_PROBABLE
 *  4. KNOWN matches whose compared fields differ → CHANGED_INFO (same finding,
 *     status reflects the change; changedFields lists what differs)
 * Everything else → NEW.
 */
export function compareWithCurated(
  candidates: readonly CandidateView[],
  curated: readonly CuratedRecordView[],
  options: ComparisonOptions = {},
): ComparisonFinding[] {
  const probableRadius = options.probableRadiusMeters ?? DEFAULT_PROBABLE_RADIUS_METERS;
  const exactRadius = options.exactRadiusMeters ?? DEFAULT_EXACT_RADIUS_METERS;

  const curatedByDocumentId = new Map<string, CuratedRecordView>();
  for (const record of curated) {
    if (record.documentId !== undefined) curatedByDocumentId.set(record.documentId, record);
  }

  const findings: ComparisonFinding[] = [];

  for (const candidate of candidates) {
    let matched: CuratedRecordView | null = null;
    let matchedDocumentId: string | null = null;
    let reason = "no curated record matches this candidate";
    let status: ComparisonStatus = "NEW";

    // Strategy 1: OSM element reference in provenance.
    for (const record of curated) {
      const references = extractOsmReferences(record.source);
      const hit = references.some(
        (ref) => ref.type === candidate.osmType && ref.id === candidate.osmId,
      );
      if (hit) {
        const distance = haversineMeters(candidate.coordinates, record.coordinates);
        if (distance <= exactRadius) {
          matched = record;
          matchedDocumentId = record.documentId ?? null;
          reason = `curated provenance references OSM ${candidate.osmType}/${candidate.osmId} (${Math.round(distance)} m apart)`;
          status = "KNOWN_EXACT";
        }
        break;
      }
    }

    // Strategy 2: deterministic document id match.
    if (matched === null) {
      const derived = candidate.documentId;
      if (derived !== undefined && curatedByDocumentId.has(derived)) {
        matched = curatedByDocumentId.get(derived) ?? null;
        matchedDocumentId = derived;
        reason = "candidate derives the same deterministic facility document id";
        status = "KNOWN_EXACT";
      }
    }

    // Strategy 3: normalized name + distance.
    if (matched === null && candidate.name !== null) {
      const candidateName = normalizeName(candidate.name);
      if (candidateName !== "") {
        let best: { record: CuratedRecordView; distance: number } | null = null;
        for (const record of curated) {
          if (normalizeName(record.name) !== candidateName) continue;
          const distance = haversineMeters(candidate.coordinates, record.coordinates);
          if (distance <= probableRadius && (best === null || distance < best.distance)) {
            best = { record, distance };
          }
        }
        if (best !== null) {
          matched = best.record;
          matchedDocumentId = best.record.documentId ?? null;
          reason = `normalized-name match ${Math.round(best.distance)} m apart`;
          status = "KNOWN_PROBABLE";
        }
      }
    }

    // Strategy 4: surface changed information on matched records.
    const changedFields: string[] = [];
    if (matched !== null) {
      if (candidate.phone !== null && matched.phone !== undefined && matched.phone.trim() !== candidate.phone.trim()) {
        changedFields.push("phone");
      }
      if (candidate.openingHours !== null && matched.openingHours !== undefined && matched.openingHours.trim() !== candidate.openingHours.trim()) {
        changedFields.push("openingHours");
      }
      if (candidate.addressCandidate !== null && matched.address !== undefined && matched.address.trim() !== candidate.addressCandidate.trim()) {
        changedFields.push("address");
      }
      if (changedFields.length > 0) {
        status = "CHANGED_INFO";
        reason += `; differs in: ${changedFields.join(", ")}`;
      }
    }

    findings.push({
      candidateId: candidate.candidateId,
      status,
      matchedDocumentId,
      changedFields,
      reason,
    });
  }

  return findings;
}
