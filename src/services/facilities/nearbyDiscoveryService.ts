/**
 * Runtime nearby facility discovery (AD-13 architecture spike).
 *
 * Combines two explicitly separated sources:
 *
 *   Firestore verified facilities                        (trusted authority)
 *     ↓  existing findNearbyFacilities() — UNCHANGED
 *     ↓  adaptVerifiedFacilities()                       (this module)
 *     ↓  NearbyFacility { trust: "verified", source.id: "lifeguard360" }
 *
 *   Future external provider                              (untrusted)
 *     ↓  FacilityDiscoveryProvider                       (interface only — no provider implemented)
 *     ↓  provider adapter normalization
 *     ↓  NearbyFacility { trust: "dynamic", source.id: "dynamic-provider" }  (stamped HERE)
 *
 *   verified + dynamic
 *     ↓  dedupeNearbyResults()                           (named seam — NOT implemented yet)
 *     ↓  nearest-first sort (app-computed distance)
 *     ↓  future UI
 *
 * Trust rule (test-pinned): a provider returning a facility never makes it
 * verified. Distances are always computed by Lifeguard360 from the user's
 * fix; any provider-supplied distance is discarded. Provider failures are
 * normalized into NearbyDiscoveryErrorCode and never expose raw payloads.
 */

import type { FacilityWithDistance, GeoCoordinates } from "@/types";
import { distanceMeters } from "@/utils/format";

import { findNearbyFacilities } from "./facilityService";
import {
  NearbyDiscoveryError,
  withDistanceFrom,
  validateNearbyQuery,
  buildNearbyFacilityId,
  type FacilitySourceInfo,
  type FacilityTrust,
  type NearbyDiscoveryErrorCode,
  type NearbyFacility,
  type NearbyFacilityQuery,
  type NearbyFacilitySearchResult,
  type FacilityDiscoveryProvider,
} from "./nearbyDiscoveryContracts";

/** Source metadata for the trusted dataset. */
export const LIFEGUARD360_SOURCE: FacilitySourceInfo = {
  id: "lifeguard360",
  label: "Verified by Lifeguard360",
};

/** Source metadata used for any dynamic-provider result. */
export function dynamicProviderSource(label: string, stability: "osm" | "commercial" | "other" = "other"): FacilitySourceInfo {
  return { id: "dynamic-provider", label, stability };
}

// ---------------------------------------------------------------- adapters

/**
 * Adapts the existing verified FacilityWithDistance results (from the
 * unchanged findNearbyFacilities() authority) into the normalized model.
 * The original distanceMeters computed by the trusted path is kept — it was
 * already derived from the user's fix by our own haversine.
 */
export function adaptVerifiedFacilities(facilities: readonly FacilityWithDistance[]): NearbyFacility[] {
  return facilities.map((facility) => ({
    id: facility.id,
    name: facility.name,
    coordinates: facility.coordinates,
    category: facility.category,
    source: LIFEGUARD360_SOURCE,
    trust: "verified" satisfies FacilityTrust,
    distanceMeters: facility.distanceMeters,
    address: facility.address,
    phone: facility.phone,
    openingHours: facility.openingHours,
  }));
}

/**
 * Prepares provider-returned records for the normalized model WITHOUT
 * granting trust: trust and source are stamped by this service, and any
 * provider-supplied distance is discarded and recomputed. This is the
 * normalization boundary where a real provider adapter will hook in.
 */
export function normalizeDynamicCandidate(
  candidate: NearbyFacility,
  userCoordinates: GeoCoordinates,
  source: FacilitySourceInfo,
): NearbyFacility {
  const externalId = candidate.externalId ?? candidate.id;
  return withDistanceFrom(
    {
      id: buildNearbyFacilityId(source.id, externalId),
      name: candidate.name,
      coordinates: candidate.coordinates,
      category: candidate.category,
      source,
      trust: "dynamic" satisfies FacilityTrust,
      address: candidate.address,
      phone: candidate.phone,
      openingHours: candidate.openingHours,
      operator: candidate.operator,
      externalId,
      sourceUrl: candidate.sourceUrl,
      // distanceMeters recomputed below via withDistanceFrom — provider value discarded.
      distanceMeters: Number.NaN,
    },
    userCoordinates,
  );
}

// ---------------------------------------------------------------- dedup seam

/**
 * FUTURE DEDUPLICATION SEAM — intentionally not implemented in this spike.
 *
 * The future implementation will compare verified + dynamic results on
 * coordinates, external IDs, names, facility types and proximity to collapse
 * the same physical facility appearing in both sources, WITHOUT ever letting
 * a dynamic record upgrade a verified one. Today this is an identity
 * pass-through so the pipeline shape is already correct.
 */
export function dedupeNearbyResults(facilities: readonly NearbyFacility[]): NearbyFacility[] {
  return [...facilities];
}

// ---------------------------------------------------------------- errors

/** Maps the trusted Firestore path's failure to the normalized error contract. */
function toNormalizedError(error: unknown): NearbyDiscoveryError {
  if (error instanceof NearbyDiscoveryError) return error;
  // Firebase not configured / unavailable / permission — one normalized code,
  // message kept generic so provider/Firebase internals never leak.
  return new NearbyDiscoveryError("provider-unavailable", "Facility data is currently unavailable.");
}

/**
 * Safely invokes the optional dynamic provider. A provider failure never
 * discards verified results: it is recorded in diagnostics instead.
 */
async function runProvider(
  provider: FacilityDiscoveryProvider,
  query: NearbyFacilityQuery,
): Promise<{ facilities: NearbyFacility[]; errorCode: NearbyDiscoveryErrorCode | null }> {
  try {
    const facilities = await provider.searchNearby(query);
    if (!Array.isArray(facilities)) {
      return { facilities: [], errorCode: "provider-malformed-response" };
    }
    return { facilities, errorCode: null };
  } catch (caught) {
    const code: NearbyDiscoveryErrorCode =
      caught instanceof NearbyDiscoveryError
        ? caught.code
        : "unexpected-provider-failure";
    return { facilities: [], errorCode: code };
  }
}

// ---------------------------------------------------------------- public API

export async function searchNearbyFacilities(
  query: NearbyFacilityQuery,
  provider?: FacilityDiscoveryProvider,
): Promise<NearbyFacilitySearchResult> {
  // 1. Validate first — deterministic first-violation (coordinates, then radius).
  const violation = validateNearbyQuery(query);
  if (violation !== null) {
    throw new NearbyDiscoveryError(violation, violation === "invalid-coordinates" ? "Invalid coordinates." : "Invalid search radius.");
  }

  // 2–3. Trusted verified path (existing authority), adapted to the normalized model.
  let verified: NearbyFacility[];
  let verifiedError: NearbyDiscoveryErrorCode | null = null;
  let verifiedNote: string | null = null;
  try {
    const result = await findNearbyFacilities(query.coordinates, query.radiusMeters);
    verified = adaptVerifiedFacilities(result.facilities);
    verifiedNote = result.note;
  } catch (error) {
    verified = [];
    verifiedError = toNormalizedError(error).code;
  }

  // 4–6. Optional dynamic provider — best-effort, never blocks verified results.
  let dynamic: NearbyFacility[] = [];
  let dynamicError: NearbyDiscoveryErrorCode | null = null;
  let providerSource: FacilitySourceInfo | null = null;
  if (provider !== undefined) {
    providerSource = dynamicProviderSource(provider.providerId, "osm");
    const outcome = await runProvider(provider, query);
    dynamicError = outcome.errorCode;
    dynamic = outcome.facilities.map((candidate) => normalizeDynamicCandidate(candidate, query.coordinates, providerSource as FacilitySourceInfo));
  }

  // 7. Combine, dedup seam, sort.
  const combined = dedupeNearbyResults([...verified, ...dynamic]);
  const facilities = [...combined].sort((a, b) => a.distanceMeters - b.distanceMeters);

  // 8. Honest diagnostics.
  const countsBySource: Record<string, number> = {};
  for (const facility of facilities) {
    countsBySource[facility.source.id] = (countsBySource[facility.source.id] ?? 0) + 1;
  }
  const errorsBySource: Record<string, NearbyDiscoveryErrorCode> = {};
  if (verifiedError !== null) errorsBySource[defaultVerifiedSourceKey] = verifiedError;
  if (dynamicError !== null && providerSource !== null) errorsBySource[providerSource.label] = dynamicError;

  const sources: FacilitySourceInfo[] = [LIFEGUARD360_SOURCE];
  if (providerSource !== null) sources.push(providerSource);

  const notes: string[] = [];
  if (verifiedError !== null) notes.push("Verified facility data is currently unavailable.");
  else if (verified.length === 0 && verifiedNote !== null) notes.push(verifiedNote);
  if (dynamicError !== null) notes.push("Dynamic nearby search is temporarily unavailable.");
  const note = notes.length > 0 ? notes.join(" ") : null;

  return { facilities, sources, diagnostics: { countsBySource, errorsBySource: Object.keys(errorsBySource).length > 0 ? errorsBySource : undefined }, note };
}

/** Diagnostics key for the trusted verified source. */
const defaultVerifiedSourceKey = "lifeguard360";

// ---------------------------------------------------------------- test-only provider

/**
 * TESTS ONLY — a trivial static provider that exercises the provider contract
 * with no network. It returns records WITHOUT trust/distance so the test suite
 * can pin that the service (not the provider) assigns both.
 */
export class StaticTestProvider implements FacilityDiscoveryProvider {
  readonly providerId: string;
  private readonly records: NearbyFacility[];

  constructor(records: NearbyFacility[], providerId = "static-test-provider") {
    this.providerId = providerId;
    this.records = records;
  }

  async searchNearby(): Promise<NearbyFacility[]> {
    return this.records.map((record) => ({ ...record, trust: undefined as unknown as FacilityTrust, distanceMeters: Number.NaN }));
  }
}

/** Re-export for consumers that only import the service module. */
export { distanceMeters };
