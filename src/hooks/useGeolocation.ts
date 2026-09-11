import { useCallback, useState } from "react";

import type { LocationFix } from "@/types";

/**
 * One-shot browser Geolocation API wrapper (Phase 6 behaviour contract):
 * location is NEVER requested automatically and NEVER watched continuously —
 * only an explicit user action calls `requestFix`.
 */

export type GeoRequestStatus =
  "idle" | "requesting" | "granted" | "denied" | "unavailable" | "unsupported";

export interface GeoRequestResult {
  status: GeoRequestStatus;
  /** Last successful one-shot fix, if any. */
  fix: LocationFix | null;
  /** Human-readable explanation for failure states (honest error copy). */
  message: string | null;
  requestFix: () => Promise<LocationFix | null>;
  reset: () => void;
}

function errorCodeToMessage(code: number): string {
  switch (code) {
    case 1:
      return "Location permission was denied. Enable it in your browser settings to share your location.";
    case 2:
      return "Your position could not be determined. Check that location services are enabled and try again.";
    case 3:
      return "Location request timed out. Try again, preferably outdoors or near a window.";
    default:
      return "Location could not be determined. Please try again.";
  }
}

/**
 * Acquire a single fix with a bounded wait. Returns null (never throws) so
 * callers can branch on `status` and `message`.
 */
export function useGeolocation(): GeoRequestResult {
  const [status, setStatus] = useState<GeoRequestStatus>("idle");
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const requestFix = useCallback(async (): Promise<LocationFix | null> => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unsupported");
      setMessage("Your browser does not support location sharing.");
      return null;
    }

    setStatus("requesting");
    setMessage(null);

    return new Promise<LocationFix | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const next: LocationFix = {
            coordinates: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          };
          setFix(next);
          setStatus("granted");
          setMessage(null);
          resolve(next);
        },
        (error) => {
          setStatus(error.code === 1 ? "denied" : "unavailable");
          setMessage(errorCodeToMessage(error.code));
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      );
    });
  }, []);

  const reset = useCallback((): void => {
    setStatus("idle");
    setFix(null);
    setMessage(null);
  }, []);

  return { status, fix, message, requestFix, reset };
}
