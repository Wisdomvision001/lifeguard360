/**
 * ReverseGeocodeService (Task 1) — the SINGLE readable-location authority.
 *
 * It answers one question for one already-acquired coordinate: "what does
 * OpenStreetMap call this place?" Nothing else. It does NOT acquire location
 * (that remains `locationService`, one-shot and user-initiated only), never
 * watches, never polls, and never asks the browser for anything.
 *
 * Endpoint choice: Nominatim (OpenStreetMap). No API key, no account and no
 * proxy are required, and the public instance answers browser requests with
 * `Access-Control-Allow-Origin: *`. Its usage policy is honoured here instead
 * of assumed:
 *   - an absolute maximum of 1 request per second PER APPLICATION → the
 *     module-level gate below, plus the session cache (the policy also warns
 *     that clients repeating the same query may be blocked);
 *   - a valid identifying `Referer` is sent by the browser automatically, so
 *     `referrerPolicy` is deliberately NOT set to "no-referrer";
 *   - attribution is mandatory → `REVERSE_GEOCODE_ATTRIBUTION` is rendered
 *     wherever a resolved label is displayed;
 *   - no autocomplete, no systematic/grid queries, no reselling — this service
 *     performs exactly one lookup per explicit, user-triggered fix.
 *
 * Privacy: the request carries the latitude, longitude and static format
 * parameters ONLY. No uid, email, phone, contacts, profile or Firebase data is
 * sent, because none of it exists in the signature of this module. Coordinates
 * are never persisted (the cache is in-process memory only) and never logged.
 */

import type { GeoCoordinates } from "@/types";

// ---------------------------------------------------------------- endpoint

/** Public Nominatim reverse endpoint — keyless, CORS-enabled, no proxy. */
export const NOMINATIM_REVERSE_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";

/**
 * Locality-level zoom. The default (18) can name the single nearest OSM object
 * — a shop or one road segment someone happens to stand beside — which would
 * misrepresent a person's position. At 16 the honest locality answer wins.
 */
export const NOMINATIM_REVERSE_ZOOM = 16;

/** Client-side abort budget. The label is supplementary: it must never hang the UI. */
export const REVERSE_GEOCODE_TIMEOUT_MS = 6_000;

/** Usage-policy ceiling (per application): no more than one request per second. */
export const REVERSE_GEOCODE_MIN_INTERVAL_MS = 1_000;

/** Mandatory attribution for ODbL data returned by the service. */
export const REVERSE_GEOCODE_ATTRIBUTION = "© OpenStreetMap contributors (ODbL).";

/** Mandatory disclosure: the coordinate is shared with OpenStreetMap to describe it. */
export const REVERSE_GEOCODE_DISCLOSURE =
  "Your coordinates are sent to OpenStreetMap to describe your location.";

// ------------------------------------------------------------------ outcome

/** Why no readable location exists — honest, actionable, never a fabricated place. */
export type ReverseGeocodeFailureReason =
  | "invalid-coordinates"
  | "no-result"
  | "malformed"
  | "rate-limited"
  | "timeout"
  | "unavailable";

/** A label that a real service really returned for this coordinate. */
export interface ResolvedPlace {
  /** Verbatim (or factually composed) OpenStreetMap text — never invented. */
  label: string;
  /** The coordinates this label describes (echoed, for keying/display). */
  coordinates: GeoCoordinates;
  /** Mandatory ODbL attribution for this data. */
  attribution: string;
}

export interface ReverseGeocodeOutcome {
  place: ResolvedPlace | null;
  reason: ReverseGeocodeFailureReason | null;
}

export interface ReverseGeocodeConfig {
  endpoint?: string;
  /** Client-side abort budget in ms. */
  timeoutMs?: number;
  /** Minimum spacing between requests (usage-policy gate). */
  minRequestIntervalMs?: number;
  /** Injectable transport for tests (defaults to globalThis.fetch). */
  fetchFn?: typeof fetch;
  /** Injectable clock for the rate gate (tests). */
  now?: () => number;
  /** Injectable wait for the rate gate (tests). */
  wait?: (ms: number) => Promise<void>;
}

// ------------------------------------------------------------- validation

function isValidCoordinate(value: unknown, limit: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

/**
 * Coordinates are validated BEFORE any request is made: an unusable fix must
 * never leave the device, and must never reach a third party as `0,0`.
 */
export function isValidGeocodeCoordinates(coordinates: unknown): coordinates is GeoCoordinates {
  if (coordinates === null || typeof coordinates !== "object") return false;
  const candidate = coordinates as { latitude?: unknown; longitude?: unknown };
  return isValidCoordinate(candidate.latitude, 90) && isValidCoordinate(candidate.longitude, 180);
}

// ------------------------------------------------------------ request shape

/**
 * Builds the request URL. Pure and exported so a test can prove that the ONLY
 * information leaving the device is the coordinate plus static parameters.
 */
export function buildReverseGeocodeUrl(
  coordinates: GeoCoordinates,
  endpoint: string = NOMINATIM_REVERSE_ENDPOINT,
): string {
  const url = new URL(endpoint);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(coordinates.latitude));
  url.searchParams.set("lon", String(coordinates.longitude));
  url.searchParams.set("zoom", String(NOMINATIM_REVERSE_ZOOM));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "en");
  return url.toString();
}

// ------------------------------------------------------------- label reading

/**
 * Address keys in locality order. Used ONLY to compose a label when Nominatim
 * returns no `display_name`, and only from parts it actually returned.
 */
const ADDRESS_KEYS = [
  "neighbourhood",
  "suburb",
  "village",
  "hamlet",
  "town",
  "city",
  "municipality",
  "county",
  "state",
  "country",
] as const;

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Extracts a human-readable label from a Nominatim `jsonv2` payload without
 * ever inventing one: the returned `display_name` is used verbatim; when it is
 * absent/empty the label is composed from the address parts OSM actually sent
 * (locality → county → state → country), de-duplicated and never padded. A
 * payload with nothing usable returns null (incomplete information is shown as
 * absent, not as a guess).
 */
export function describePlaceLabel(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object") return null;
  const record = payload as { display_name?: unknown; address?: unknown };

  const displayName = readString(record.display_name);
  if (displayName !== null) return displayName;

  if (record.address === null || typeof record.address !== "object") return null;
  const address = record.address as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ADDRESS_KEYS) {
    const part = readString(address[key]);
    if (part === null) continue;
    if (parts.some((existing) => existing.toLowerCase() === part.toLowerCase())) continue;
    parts.push(part);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

// ------------------------------------------------------- session-memory state

interface CacheEntry {
  expiresAt: number;
  place: ResolvedPlace;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

/** ~110 m — coarse enough to absorb GPS jitter (the facility provider's precision). */
const CACHE_KEY_PRECISION = 3;

/**
 * Session-local (memory only) success cache + in-flight reuse. Nothing is
 * persisted, nothing survives a reload, and no location history is written
 * anywhere. It exists because the usage policy requires caching and explicitly
 * warns that repeated identical queries get clients classified as faulty.
 */
const resultCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ReverseGeocodeOutcome>>();

/** Shared gate + last request time — the 1 request/second ceiling for the whole app. */
let gate: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function cacheKey(coordinates: GeoCoordinates): string {
  return `${coordinates.latitude.toFixed(CACHE_KEY_PRECISION)},${coordinates.longitude.toFixed(CACHE_KEY_PRECISION)}`;
}

/** Test/maintenance helper — clears the session cache, in-flight map and rate gate. */
export function clearReverseGeocodeCache(): void {
  resultCache.clear();
  inFlight.clear();
  gate = Promise.resolve();
  lastRequestAt = 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Serializes requests through a shared gate and waits until the previous
 * request is at least `minIntervalMs` old. Concurrent lookups therefore queue
 * instead of firing together, keeping the whole application inside the
 * policy's one-request-per-second ceiling.
 */
async function awaitRequestSlot(
  minIntervalMs: number,
  now: () => number,
  wait: (ms: number) => Promise<void>,
): Promise<void> {
  if (minIntervalMs <= 0) return;
  const slot = gate.then(async () => {
    const waitMs = lastRequestAt + minIntervalMs - now();
    if (waitMs > 0) await wait(waitMs);
    lastRequestAt = now();
  });
  gate = slot.catch(() => undefined);
  return slot;
}

function isAbortFailure(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  return name === "AbortError" || name === "TimeoutError";
}

// ------------------------------------------------------------------ lookup

/**
 * Reverse-geocodes ONE coordinate. Never throws: every failure resolves to
 * `{ place: null, reason }` so callers can keep showing coordinates — the
 * honest fallback — without an error boundary or a fabricated place name.
 *
 * Deliberately NO retry: a retry would push the application past the usage
 * policy's rate ceiling, and a readable place name is supplementary
 * information, not something worth a second request.
 */
export async function reverseGeocode(
  coordinates: GeoCoordinates,
  config: ReverseGeocodeConfig = {},
): Promise<ReverseGeocodeOutcome> {
  if (!isValidGeocodeCoordinates(coordinates)) {
    return { place: null, reason: "invalid-coordinates" };
  }

  const endpoint = config.endpoint ?? NOMINATIM_REVERSE_ENDPOINT;
  const timeoutMs = config.timeoutMs ?? REVERSE_GEOCODE_TIMEOUT_MS;
  const minIntervalMs = config.minRequestIntervalMs ?? REVERSE_GEOCODE_MIN_INTERVAL_MS;
  const fetchFn = config.fetchFn ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const now = config.now ?? (() => Date.now());
  const wait = config.wait ?? delay;

  const key = cacheKey(coordinates);
  const cached = resultCache.get(key);
  if (cached !== undefined && cached.expiresAt > now()) {
    return { place: cached.place, reason: null };
  }

  const pending = inFlight.get(key);
  if (pending !== undefined) return pending;

  const request = (async (): Promise<ReverseGeocodeOutcome> => {
    try {
      await awaitRequestSlot(minIntervalMs, now, wait);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchFn(buildReverseGeocodeUrl(coordinates, endpoint), {
          method: "GET",
          headers: { Accept: "application/json" },
          // No cookies or credentials are ever attached to the third-party call.
          credentials: "omit",
          signal: controller.signal,
        });
      } catch (caught) {
        return { place: null, reason: isAbortFailure(caught) ? "timeout" : "unavailable" };
      } finally {
        clearTimeout(timer);
      }

      if (response.status === 429) {
        // Drain the body so the connection stays reusable — never parsed as data.
        await response.text().catch(() => "");
        return { place: null, reason: "rate-limited" };
      }
      if (!response.ok) {
        await response.text().catch(() => "");
        return { place: null, reason: "unavailable" };
      }

      let payload: unknown;
      try {
        payload = JSON.parse(await response.text());
      } catch {
        // A malformed body must never be re-requested — the response would be identical.
        return { place: null, reason: "malformed" };
      }

      // A Nominatim response is always a JSON object; anything else (a bare
      // array, a string, null) is structurally broken and never re-requested.
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        return { place: null, reason: "malformed" };
      }

      const label = describePlaceLabel(payload);
      if (label === null) return { place: null, reason: "no-result" };

      return {
        place: {
          label,
          coordinates: { latitude: coordinates.latitude, longitude: coordinates.longitude },
          attribution: REVERSE_GEOCODE_ATTRIBUTION,
        },
        reason: null,
      };
    } catch {
      // Defensive backstop: this service must never surface a thrown error to the UI.
      return { place: null, reason: "unavailable" };
    }
  })()
    .then((outcome) => {
      // Only successes are cached: a transient outage must not be remembered.
      if (outcome.place !== null) {
        resultCache.set(key, { expiresAt: now() + CACHE_TTL_MS, place: outcome.place });
      }
      return outcome;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}
