/**
 * Overpass (OpenStreetMap) runtime discovery provider — AD-13 implementation.
 *
 * The single HTTP seam for victim-facing dynamic facility discovery. It
 * implements the existing `FacilityDiscoveryProvider` contract from
 * `nearbyDiscoveryContracts.ts`; it does NOT define a second discovery
 * architecture, does not touch Firestore, and never assigns trust or distance
 * (the service stamps both).
 *
 * Layering rule (docs/FACILITY-DISCOVERY.md Part 1 vs Part 2): the developer
 * discovery CLI in `tools/facilityDiscovery/` and this runtime provider share
 * the *approved tag union* but no code paths. The union below deliberately
 * mirrors `tools/facilityDiscovery/query.ts` (`amenity=hospital|clinic|
 * pharmacy|doctors` + any `healthcare=*`) so curation and runtime never drift.
 *
 * Privacy: the request body carries the latitude, longitude, radius and the
 * static tag filters ONLY. No uid, email, phone, contacts or profile data ever
 * leaves the device, and coordinates are never logged.
 */

import type { GeoCoordinates } from "@/types";

import {
  NearbyDiscoveryError,
  NEARBY_RADIUS_LIMITS,
  isValidLatitude,
  isValidLongitude,
  type FacilityCategoryFilter,
  type FacilityDiscoveryProvider,
  type FacilityTrust,
  type NearbyDiscoveryErrorCode,
  type NearbyFacility,
  type NearbyFacilityQuery,
} from "./nearbyDiscoveryContracts";

// ---------------------------------------------------------------- endpoint

/**
 * Public Overpass instance. No API key, no proxy, no credentials — the service
 * answers with `Access-Control-Allow-Origin: *` for browser requests.
 */
export const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

/** Server-side query budget (seconds) — bounded so a slow query cannot hang the UI. */
const OVERPASS_SERVER_TIMEOUT_S = 15;

/** Client-side abort budget. Must exceed the server budget only in the worst case, hence the equality. */
export const OVERPASS_CLIENT_TIMEOUT_MS = 15_000;

/** One retry only (mirrors the tooling policy), but with an interactive-friendly pause. */
const OVERPASS_RETRY_DELAY_MS = 1_500;

/** Server-side element cap + adapter cap: bounds payload size on dense cities. */
const OVERPASS_ELEMENT_LIMIT = 200;

// ------------------------------------------------------- approved tag union

/**
 * OSM amenity values queried directly (approved union). `healthcare=*` is
 * queried separately below and narrowed by the category mapper, so records
 * tagged only with an unrelated healthcare value (dentist, laboratory,
 * optician, …) are dropped instead of being mislabelled.
 */
const QUERIED_AMENITIES = ["hospital", "clinic", "pharmacy", "doctors"] as const;

// ------------------------------------------------------------ category mapping

export type DiscoveredCategory = "hospital" | "clinic" | "pharmacy" | "health-centre";

/** Precedence-ordered rules — first match wins (same order as the curation mapper). */
const CATEGORY_RULES: readonly { tag: "amenity" | "healthcare"; value: string; category: DiscoveredCategory }[] = [
  { tag: "amenity", value: "hospital", category: "hospital" },
  { tag: "amenity", value: "clinic", category: "clinic" },
  { tag: "amenity", value: "pharmacy", category: "pharmacy" },
  { tag: "amenity", value: "doctors", category: "clinic" },
  { tag: "healthcare", value: "pharmacy", category: "pharmacy" },
  { tag: "healthcare", value: "clinic", category: "clinic" },
  { tag: "healthcare", value: "centre", category: "health-centre" },
  { tag: "healthcare", value: "doctor", category: "clinic" },
  { tag: "healthcare", value: "doctors", category: "clinic" },
  { tag: "healthcare", value: "hospital", category: "hospital" },
];

/** Human labels used ONLY for the explicit "name not in OpenStreetMap" fallback. */
const CATEGORY_LABELS: Record<DiscoveredCategory, string> = {
  hospital: "Hospital",
  clinic: "Clinic",
  pharmacy: "Pharmacy",
  "health-centre": "Health centre",
};

function readTag(tags: Record<string, unknown>, key: string): string | undefined {
  const value = tags[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Maps OSM tags onto the project's facility taxonomy. Values may be semicolon
 * lists in real OSM data (e.g. `healthcare="birthing_center;clinic;doctor"`),
 * so each token is tested. Unrecognised combinations return null — never a guess.
 */
export function mapOsmCategory(tags: Record<string, unknown> | undefined): DiscoveredCategory | null {
  if (tags === undefined) return null;

  const values: Record<"amenity" | "healthcare", string[]> = {
    amenity: (readTag(tags, "amenity") ?? "").toLowerCase().split(";").map((v) => v.trim()).filter((v) => v !== ""),
    healthcare: (readTag(tags, "healthcare") ?? "").toLowerCase().split(";").map((v) => v.trim()).filter((v) => v !== ""),
  };

  for (const rule of CATEGORY_RULES) {
    if (values[rule.tag].includes(rule.value)) return rule.category;
  }
  return null;
}

// ------------------------------------------------------------- query building

/** Renders a coordinate for Overpass QL without inventing precision. */
function coordinateText(coordinates: GeoCoordinates): string {
  return `${coordinates.latitude},${coordinates.longitude}`;
}

/**
 * Builds the deterministic `around:` query for the user's CURRENT coordinates.
 * Pure and exported for tests: no city, region or facility name ever appears
 * here — the coordinates are the only geographic input.
 */
export function buildOverpassQuery(coordinates: GeoCoordinates, radiusMeters: number): string {
  const around = `(around:${radiusMeters},${coordinateText(coordinates)})`;
  const statements = [
    ...QUERIED_AMENITIES.map((value) => `  nwr["amenity"="${value}"]${around};`),
    `  nwr["healthcare"]${around};`,
  ];
  return [
    `[out:json][timeout:${OVERPASS_SERVER_TIMEOUT_S}];`,
    "(",
    ...statements,
    ");",
    `out center tags ${OVERPASS_ELEMENT_LIMIT};`,
  ].join("\n");
}

// ------------------------------------------------------------- normalization

interface OsmElement {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: unknown;
  tags?: unknown;
}

/** Coordinates from a node's own lat/lon, or a way/relation's `center`. */
function readCoordinates(element: OsmElement): GeoCoordinates | null {
  let latitude: unknown;
  let longitude: unknown;

  if (element.type === "node") {
    latitude = element.lat;
    longitude = element.lon;
  } else if (element.center !== null && typeof element.center === "object") {
    const center = element.center as { lat?: unknown; lon?: unknown };
    latitude = center.lat;
    longitude = center.lon;
  }

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
  return { latitude, longitude };
}

/** Only pieces OSM actually provides, in address order — never a guessed line. */
function readAddress(tags: Record<string, unknown>): string | undefined {
  const parts = ["addr:housenumber", "addr:street", "addr:suburb", "addr:city", "addr:state"]
    .map((key) => readTag(tags, key))
    .filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

/**
 * Normalizes one OSM element into a `NearbyFacility` candidate.
 * Returns null (record ignored) when the element is not a usable facility:
 * unknown element type, unusable id, missing/invalid coordinates, unmapped
 * category. Coordinates are NEVER defaulted — a facility without a position is
 * not a facility this app can point someone to.
 *
 * Trust and distance are intentionally left to the service boundary.
 */
export function normalizeOsmElement(element: unknown): NearbyFacility | null {
  if (element === null || typeof element !== "object") return null;
  const candidate = element as OsmElement;

  const type = candidate.type;
  if (type !== "node" && type !== "way" && type !== "relation") return null;
  if (typeof candidate.id !== "number" || !Number.isFinite(candidate.id)) return null;

  const coordinates = readCoordinates(candidate);
  if (coordinates === null) return null;

  const tags =
    candidate.tags !== null && typeof candidate.tags === "object"
      ? (candidate.tags as Record<string, unknown>)
      : undefined;
  const category = mapOsmCategory(tags);
  if (category === null) return null;

  const osmName = tags === undefined ? undefined : (readTag(tags, "name") ?? readTag(tags, "name:en"));
  const externalId = `${type}/${candidate.id}`;
  const label = CATEGORY_LABELS[category];

  return {
    id: externalId,
    // Honest absence: the label states that OSM has no name, it never invents one.
    name: osmName ?? `${label} (name not in OpenStreetMap)`,
    coordinates,
    category,
    // Stamped by the service (see contracts) — providers must not claim either.
    source: { id: "dynamic-provider", label: "OpenStreetMap" },
    trust: undefined as unknown as FacilityTrust,
    distanceMeters: Number.NaN,
    address: tags === undefined ? undefined : readAddress(tags),
    phone: tags === undefined ? undefined : (readTag(tags, "phone") ?? readTag(tags, "contact:phone")),
    openingHours: tags === undefined ? undefined : readTag(tags, "opening_hours"),
    operator: tags === undefined ? undefined : readTag(tags, "operator"),
    externalId,
    sourceUrl: `https://www.openstreetmap.org/${type}/${candidate.id}`,
  };
}

/** Parses a response body defensively; unknown shapes are a malformed response. */
function parseElements(payload: unknown): unknown[] {
  if (payload === null || typeof payload !== "object") {
    throw new NearbyDiscoveryError("provider-malformed-response", "Overpass returned an unexpected response shape.");
  }
  const elements = (payload as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) {
    throw new NearbyDiscoveryError("provider-malformed-response", "Overpass returned an unexpected response shape.");
  }
  return elements;
}

// ------------------------------------------------------------------- config

export interface OverpassProviderConfig {
  endpoint?: string;
  /** Client-side abort budget in ms. */
  timeoutMs?: number;
  /** Pause before the single retry (429 / 5xx / network only). */
  retryDelayMs?: number;
  retries?: number;
  /** Injectable transport for tests (defaults to globalThis.fetch). */
  fetchFn?: typeof fetch;
}

// --------------------------------------------------- request lifecycle cache

interface CacheEntry {
  expiresAt: number;
  facilities: NearbyFacility[];
}

/** Coordinate-key precision: ~110 m — coarse enough to absorb GPS jitter, still local. */
const CACHE_KEY_PRECISION = 3;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Session-local (memory only) result cache + in-flight reuse. It exists purely
 * so a repeated explicit search for the same spot does not re-query Overpass:
 * nothing is persisted, nothing survives a reload, and no location history is
 * written anywhere.
 */
const resultCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<NearbyFacility[]>>();

/** Test/maintenance helper — clears the session-local cache. */
export function clearOverpassCache(): void {
  resultCache.clear();
  inFlight.clear();
}

function cacheKey(query: NearbyFacilityQuery): string {
  const { latitude, longitude } = query.coordinates;
  return `${latitude.toFixed(CACHE_KEY_PRECISION)},${longitude.toFixed(CACHE_KEY_PRECISION)},${query.radiusMeters}`;
}

// ---------------------------------------------------------------- provider

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/** Maps a transport failure onto the normalized error contract. */
function transportErrorCode(error: unknown): NearbyDiscoveryErrorCode {
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return "provider-timeout";
  }
  return "provider-unavailable";
}

function statusErrorCode(status: number): NearbyDiscoveryErrorCode {
  if (status === 429) return "provider-rate-limited";
  return "provider-unavailable";
}

export class OverpassFacilityProvider implements FacilityDiscoveryProvider {
  readonly providerId = "OpenStreetMap";

  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly retries: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: OverpassProviderConfig = {}) {
    this.endpoint = config.endpoint ?? OVERPASS_ENDPOINT;
    this.timeoutMs = config.timeoutMs ?? OVERPASS_CLIENT_TIMEOUT_MS;
    this.retryDelayMs = config.retryDelayMs ?? OVERPASS_RETRY_DELAY_MS;
    this.retries = config.retries ?? 1;
    this.fetchFn = config.fetchFn ?? ((...args) => globalThis.fetch(...args));
  }

  async searchNearby(query: NearbyFacilityQuery): Promise<NearbyFacility[]> {
    if (!isValidLatitude(query?.coordinates?.latitude) || !isValidLongitude(query?.coordinates?.longitude)) {
      throw new NearbyDiscoveryError("invalid-coordinates", "Invalid coordinates.");
    }
    if (
      typeof query.radiusMeters !== "number" ||
      !Number.isFinite(query.radiusMeters) ||
      query.radiusMeters < NEARBY_RADIUS_LIMITS.min ||
      query.radiusMeters > NEARBY_RADIUS_LIMITS.max
    ) {
      throw new NearbyDiscoveryError("invalid-radius", "Invalid search radius.");
    }

    const key = cacheKey(query);
    const cached = resultCache.get(key);
    if (cached !== undefined && cached.expiresAt > Date.now()) return cached.facilities;

    const pending = inFlight.get(key);
    if (pending !== undefined) return pending;

    const request = this.requestOnce(query)
      .then((facilities) => {
        resultCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, facilities });
        return facilities;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, request);
    return request;
  }

  /** Executes the network lifecycle: one attempt plus at most one retry. */
  private async requestOnce(query: NearbyFacilityQuery): Promise<NearbyFacility[]> {
    const body = `data=${encodeURIComponent(buildOverpassQuery(query.coordinates, query.radiusMeters))}`;
    const maxAttempts = Math.max(1, Math.floor(this.retries) + 1);
    let lastError: NearbyDiscoveryError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await this.fetchFn(this.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
          signal: controller.signal,
        });
      } catch (caught) {
        // Timeouts and network faults may be worth the single retry; nothing else is.
        lastError = new NearbyDiscoveryError(
          transportErrorCode(caught),
          "The nearby facility search could not reach OpenStreetMap.",
        );
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        // Drain the error body so the connection is reusable, never parsed as data.
        await response.text().catch(() => "");
        lastError = new NearbyDiscoveryError(
          statusErrorCode(response.status),
          "OpenStreetMap could not complete the nearby facility search.",
        );
        if (isRetryableStatus(response.status) && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
          continue;
        }
        throw lastError;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(await response.text());
      } catch {
        // Malformed payloads are never retried — a second identical request cannot fix them.
        throw new NearbyDiscoveryError(
          "provider-malformed-response",
          "OpenStreetMap returned a response that could not be read.",
        );
      }

      return this.normalize(parseElements(payload), query);
    }

    throw lastError ?? new NearbyDiscoveryError("unexpected-provider-failure", "Nearby facility search failed.");
  }

  /** Element → candidate → (OSM identity dedupe, optional category filter, cap). */
  private normalize(elements: readonly unknown[], query: NearbyFacilityQuery): NearbyFacility[] {
    const byOsmIdentity = new Map<string, NearbyFacility>();
    for (const element of elements) {
      let normalised: NearbyFacility | null;
      try {
        normalised = normalizeOsmElement(element);
      } catch {
        // One unusable record must never fail the whole search.
        normalised = null;
      }
      if (normalised === null) continue;
      const externalId = normalised.externalId ?? normalised.id;
      if (!byOsmIdentity.has(externalId)) byOsmIdentity.set(externalId, normalised);
    }

    let facilities = [...byOsmIdentity.values()];
    const categories: readonly FacilityCategoryFilter[] | undefined = query.categories;
    if (categories !== undefined && categories.length > 0) {
      const allowed = new Set<string>(categories);
      facilities = facilities.filter((facility) => allowed.has(facility.category));
    }
    return facilities.slice(0, OVERPASS_ELEMENT_LIMIT);
  }
}

/** Shared application instance (stateless apart from the session-local cache). */
export const overpassProvider = new OverpassFacilityProvider();

/** Factory for tests or a future configuration surface. */
export function createOverpassProvider(config: OverpassProviderConfig = {}): OverpassFacilityProvider {
  return new OverpassFacilityProvider(config);
}
