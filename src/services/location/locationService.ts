import type { GeoCoordinates, LocationFix, LocationQuality, LocationSource } from "@/types";

/**
 * LocationService — the SINGLE acquisition authority for the browser
 * Geolocation API (Phase 5B). Hooks and pages consume this service; nothing
 * else calls navigator.geolocation directly.
 *
 * Behaviour contract (AD-11, unchanged): location is one-shot and
 * user-initiated only — one getCurrentPosition() per explicit request, never
 * a watch, never a background/continuous stream, never persisted as history.
 */

export interface LocationOutcome {
  fix: LocationFix | null;
  error: string | null;
}

/** Geolocation options — the 30 s maximumAge is a deliberate emergency-utility compromise (cached fix ≈ faster first lock). */
const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 30000,
};

/** A fix older than this is presented as stale in the UI. (Application freshness ≠ browser maximumAge.) */
export const FRESHNESS_WINDOW_MS = 5 * 60 * 1000;

export function isFresh(fix: LocationFix, now = Date.now()): boolean {
  return now - fix.timestamp <= FRESHNESS_WINDOW_MS;
}

/** Accuracy bands: <20 excellent · ≤50 good · ≤100 acceptable · ≤500 poor · >500 critical. */
const QUALITY_THRESHOLDS: readonly { max: number; quality: LocationQuality }[] = [
  { max: 20, quality: "excellent" },
  { max: 50, quality: "good" },
  { max: 100, quality: "acceptable" },
  { max: 500, quality: "poor" },
];

/** Classify an accuracy radius in metres into an honest quality band. */
export function classifyAccuracy(accuracyMeters: number): LocationQuality {
  for (const threshold of QUALITY_THRESHOLDS) {
    if (accuracyMeters < threshold.max) return threshold.quality;
  }
  return "critical";
}

/**
 * The browser Geolocation API does not reliably reveal whether a fix came
 * from GPS or network positioning. While a request is running we keep
 * enableHighAccuracy on, but labelling the result "gps" would be a guess —
 * so the source is honest "unknown" unless future evidence proves otherwise.
 */
function describeSource(): LocationSource {
  return "unknown";
}

/** Structural + numeric sanity checks. Invalid browser payloads are rejected, never coerced. */
export function isValidFixInput(position: {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}): boolean {
  const { latitude, longitude, accuracy, timestamp } = position;
  return (
    Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 &&
    Number.isFinite(accuracy) && accuracy >= 0 &&
    Number.isFinite(timestamp) && timestamp > 0
  );
}

/** Human-readable explanation for a rejected payload (never a raw browser error). */
export function describeInvalidFix(): string {
  return "The location provided by your device was invalid. Please try again.";
}

/**
 * Acquire a single fix; never throws. Invalid browser payloads resolve as a
 * structured failure ({fix: null, error}) rather than being coerced or thrown.
 */
export function acquireLocationFix(
  options: PositionOptions = GEO_OPTIONS,
  geolocation: Geolocation | null =
    typeof navigator !== "undefined" && "geolocation" in navigator ? navigator.geolocation : null,
): Promise<LocationOutcome> {
  return new Promise((resolve) => {
    if (geolocation === null) {
      resolve({ fix: null, error: "Your browser does not support location sharing." });
      return;
    }
    geolocation.getCurrentPosition(
      (position) => {
        const candidate = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };
        if (!isValidFixInput(candidate)) {
          resolve({ fix: null, error: describeInvalidFix() });
          return;
        }
        resolve({
          fix: {
            coordinates: { latitude: candidate.latitude, longitude: candidate.longitude },
            accuracy: candidate.accuracy,
            timestamp: candidate.timestamp,
            source: describeSource(),
            quality: classifyAccuracy(candidate.accuracy),
          },
          error: null,
        });
      },
      (error) => {
        const message =
          error.code === 1
            ? "Location permission was denied."
            : error.code === 2
              ? "Your position could not be determined."
              : "Location request timed out.";
        resolve({ fix: null, error: message });
      },
      options,
    );
  });
}

/** Distance helper re-exported for convenience of location consumers. */
export type { GeoCoordinates };
