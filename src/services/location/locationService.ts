import type { LocationFix } from "@/types";

/**
 * LocationService (Phase 6/7): the browser Geolocation API acquires
 * coordinates; nothing else. One-shot only — no watching, no background
 * tracking (AD-11). Location is persisted only when the user performs an
 * action that requires it (e.g. location shared via SMS is recorded as an
 * activity event with the contact, not as a coordinate history).
 */

export interface LocationOutcome {
  fix: LocationFix | null;
  error: string | null;
}

/** Acquire a single fix; never throws. */
export function acquireLocationFix(timeoutMs = 15000): Promise<LocationOutcome> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      resolve({ fix: null, error: "Your browser does not support location sharing." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          fix: {
            coordinates: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
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
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    );
  });
}

/** A fix older than this is presented as stale in the UI. */
export const FRESHNESS_WINDOW_MS = 5 * 60 * 1000;

export function isFresh(fix: LocationFix, now = Date.now()): boolean {
  return now - fix.timestamp <= FRESHNESS_WINDOW_MS;
}
