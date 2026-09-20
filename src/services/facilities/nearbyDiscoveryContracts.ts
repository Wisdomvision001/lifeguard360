/**
 * Runtime facility-discovery contracts (AD-13 architecture spike).
 *
 * This module defines the provider abstraction for VICTIM-FACING nearby
 * facility discovery. It is deliberately separate from the developer/admin
 * Overpass CLI in tools/facilityDiscovery/ (data acquisition) — the two share
 * a pipeline name but never code paths.
 *
 * Boundaries pinned here:
 *   discovery ≠ verification      (external results are "dynamic", never
 *                                  "verified" merely because a provider returned them)
 *   discovery ≠ routing           (this layer returns facilities; directions
 *                                  are a separate future concern)
 *   Leaflet ≠ facility provider   (map rendering consumes the normalized model)
 *   provider ≠ application        (provider payloads are normalized inside the
 *                                  provider adapter; the app sees only these types)
 */

import type { GeoCoordinates } from "@/types";
import { distanceMeters } from "@/utils/format";

// ---------------------------------------------------------------- trust model

/**
 * Explicit trust classification for a nearby facility result.
 *  - "verified": reviewed and approved by Lifeguard360 (trusted dataset, e.g. Firestore).
 *  - "dynamic":  discovered at runtime from an external provider — UNTRUSTED
 *                application data; must be labelled to the user and can never
 *                automatically become "verified".
 *
 * ARCHITECTURAL RULE (test-pinned in nearbyDiscoveryService.test.ts): only the
 * Lifeguard360 trusted dataset can produce trust "verified". A provider
 * returning a facility does NOT make that facility verified.
 */
export type FacilityTrust = "verified" | "dynamic";

/**
 * Where a result came from, decoupled from any single provider product.
 *  - "lifeguard360":     the project's own curated/verified dataset.
 *  - "dynamic-provider": a runtime external provider (Overpass today, others later).
 */
export type FacilitySourceId = "lifeguard360" | "dynamic-provider";

/**
 * Coarse stability bucket so the UI can group/label dynamic sources without
 * hard-coding provider products into application code.
 */
export type DynamicSourceStability = "osm" | "commercial" | "other";

export interface FacilitySourceInfo {
  id: FacilitySourceId;
  /** Human-readable provider/product label for diagnostics and review UIs. */
  label: string;
  /** Present only for dynamic results (e.g. "osm"). */
  stability?: DynamicSourceStability;
}

// ------------------------------------------------------------- normalized model

/**
 * Normalized nearby facility — the ONLY facility shape the runtime discovery
 * layer exposes. Every externally sourced optional field stays absent when a
 * provider does not supply it (never invented, never guessed).
 */
export interface NearbyFacility {
  /**
   * Stable internal id. For dynamic results the provider adapter derives this
   * from the provider's own stable identity (e.g. OSM type+id), never from
   * runtime ordering. Verified results reuse the curated document id.
   */
  id: string;
  name: string;
  coordinates: GeoCoordinates;
  /** Coarse taxonomy aligned with the curated dataset (hospital/clinic/pharmacy/health-centre). */
  category: string;
  source: FacilitySourceInfo;
  trust: FacilityTrust;
  /**
   * Distance in metres from the user — ALWAYS calculated by Lifeguard360
   * (haversine in @/utils/format) from the user's fix and the facility's
   * coordinates. Never accepted from a provider; the service recomputes and
   * overwrites anything an adapter may have attached.
   */
  distanceMeters: number;
  address?: string;
  phone?: string;
  openingHours?: string;
  operator?: string;
  /** Provider's own stable identifier (e.g. "node/4893220623"), when available. */
  externalId?: string;
  /** Human-readable reference to the source record (e.g. an OSM element URL). */
  sourceUrl?: string;
}

// ---------------------------------------------------------------- request/response

/** Coarse category filter aligned with the curated taxonomy. */
export type FacilityCategoryFilter = "hospital" | "clinic" | "pharmacy" | "health-centre";

export interface NearbyFacilityQuery {
  coordinates: GeoCoordinates;
  /** Search radius in metres (100–50 000). */
  radiusMeters: number;
  /** Optional category filter; omitted/empty = no filtering. */
  categories?: readonly FacilityCategoryFilter[];
}

export interface NearbyFacilitySearchResult {
  /** Normalized, distance-bearing results sorted nearest-first. */
  facilities: NearbyFacility[];
  /** Which sources actually contributed (honesty + diagnostics for the UI). */
  sources: FacilitySourceInfo[];
  /** Diagnostic metadata — never raw provider payloads. */
  diagnostics: {
    /** Per-source result counts after normalization, filtering and dedup seam. */
    countsBySource: Record<string, number>;
    /** Per-source normalized error codes when one source failed while others succeeded. */
    errorsBySource?: Record<string, NearbyDiscoveryErrorCode>;
  };
  /** Human-readable note when results are limited (e.g. one source failed). */
  note: string | null;
}

// ---------------------------------------------------------------- provider contract

/**
 * The runtime provider abstraction (AD-13). The application depends on THIS,
 * never on Overpass URLs, provider SDKs, or provider response formats.
 *
 * Adapter obligations:
 *  - normalize the provider's own response into NearbyFacility[]
 *  - derive stable ids from the provider's stable identity
 *  - NEVER assign trust (the service boundary stamps it)
 *  - NEVER calculate distance (the service computes it from the user's fix)
 *  - NEVER leak raw provider payloads into the normalized model
 */
export interface FacilityDiscoveryProvider {
  /** Stable provider identifier used in source metadata and diagnostics. */
  readonly providerId: string;
  searchNearby(query: NearbyFacilityQuery): Promise<NearbyFacility[]>;
}

// ---------------------------------------------------------------- error model

/**
 * Application-level discovery error codes. Provider-specific details (URLs,
 * SDK messages, status payloads) are intentionally NOT part of this contract —
 * adapters translate failures into these codes plus a safe message.
 * "No results" is NOT an error: it is a successful empty response so the UI
 * can show its honest empty state.
 */
export type NearbyDiscoveryErrorCode =
  | "invalid-coordinates"
  | "invalid-radius"
  | "provider-unavailable"
  | "provider-timeout"
  | "provider-rate-limited"
  | "provider-malformed-response"
  | "unexpected-provider-failure";

export class NearbyDiscoveryError extends Error {
  readonly code: NearbyDiscoveryErrorCode;

  constructor(code: NearbyDiscoveryErrorCode, message: string) {
    super(message);
    this.name = "NearbyDiscoveryError";
    this.code = code;
  }
}

// ------------------------------------------------------------- pure domain helpers

export const NEARBY_RADIUS_LIMITS = { min: 100, max: 50_000 } as const;

export function isValidLatitude(latitude: unknown): latitude is number {
  return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
}

export function isValidLongitude(longitude: unknown): longitude is number {
  return typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

/**
 * Validates a query and returns the FIRST applicable violation code,
 * deterministically (coordinates before radius). Returns null when valid.
 */
export function validateNearbyQuery(query: NearbyFacilityQuery): NearbyDiscoveryErrorCode | null {
  if (query === null || typeof query !== "object") return "invalid-coordinates";
  if (!isValidLatitude(query.coordinates?.latitude)) return "invalid-coordinates";
  if (!isValidLongitude(query.coordinates?.longitude)) return "invalid-coordinates";
  const radius = query.radiusMeters;
  if (typeof radius !== "number" || !Number.isFinite(radius) || radius < NEARBY_RADIUS_LIMITS.min || radius > NEARBY_RADIUS_LIMITS.max) {
    return "invalid-radius";
  }
  return null;
}

/** Derives a stable internal id from a source identity + provider identity. Pure. */
export function buildNearbyFacilityId(sourceId: FacilitySourceId, externalId: string): string {
  return `${sourceId}:${externalId}`;
}

/**
 * Attaches an app-computed distance to a normalized facility. Pure — used by
 * the service so distance always comes from the user's actual fix, never from
 * a provider value.
 */
export function withDistanceFrom(facility: NearbyFacility, from: GeoCoordinates): NearbyFacility {
  return { ...facility, distanceMeters: distanceMeters(from, facility.coordinates) };
}
