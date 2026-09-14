import { useCallback, useState } from "react";

import type { LocationFix } from "@/types";
import {
  acquireLocationFix,
  type LocationOutcome,
} from "@/services/location/locationService";

/**
 * One-shot browser Geolocation seam (Phase 6 contract, Phase 5B internals):
 * location is NEVER requested automatically and NEVER watched continuously —
 * only an explicit user action calls `requestFix`.
 *
 * Phase 5B: the hook no longer touches navigator.geolocation itself; all
 * acquisition is delegated to locationService (the single authority) via the
 * injectable `acquire` parameter used by tests.
 */

export type GeoRequestStatus =
  "idle" | "requesting" | "granted" | "denied" | "unavailable" | "unsupported" | "invalid";

export interface GeoRequestResult {
  status: GeoRequestStatus;
  /** Last successful one-shot fix, if any. */
  fix: LocationFix | null;
  /** Human-readable explanation for failure states (honest error copy). */
  message: string | null;
  requestFix: () => Promise<LocationFix | null>;
  reset: () => void;
}

/** Browser geolocation error code → actionable, honest copy. */
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

/** Map a service outcome onto the hook's public status union. */
function statusForOutcome(outcome: LocationOutcome): {
  status: GeoRequestStatus;
  message: string | null;
} {
  if (outcome.fix !== null) return { status: "granted", message: null };
  if (outcome.error !== null && outcome.error.includes("does not support location")) {
    return { status: "unsupported", message: outcome.error };
  }
  if (outcome.error === "Location permission was denied.") {
    return { status: "denied", message: errorCodeToMessage(1) };
  }
  if (outcome.error === "Location request timed out.") {
    return { status: "unavailable", message: errorCodeToMessage(3) };
  }
  if (outcome.error === "Your position could not be determined.") {
    return { status: "unavailable", message: errorCodeToMessage(2) };
  }
  // Invalid browser payload (validation rejection) or unknown failure.
  return {
    status: outcome.error !== null && outcome.error.includes("invalid") ? "invalid" : "unavailable",
    message: outcome.error,
  };
}

/**
 * Acquire a single fix through the location service. Returns null (never
 * throws) so callers can branch on `status` and `message`.
 */
export function useGeolocation(
  acquire: (options?: PositionOptions) => Promise<LocationOutcome> = (options) =>
    acquireLocationFix(options),
): GeoRequestResult {
  const [status, setStatus] = useState<GeoRequestStatus>("idle");
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const requestFix = useCallback(async (): Promise<LocationFix | null> => {
    setStatus("requesting");
    setMessage(null);

    // Full delegation: the service is the single authority, including
    // unsupported-browser detection — the hook keeps no environment logic.
    const outcome = await acquire();
    const next = statusForOutcome(outcome);
    setFix(outcome.fix);
    setStatus(next.status);
    setMessage(next.message);
    return outcome.fix;
  }, [acquire]);

  const reset = useCallback((): void => {
    setStatus("idle");
    setFix(null);
    setMessage(null);
  }, []);

  return { status, fix, message, requestFix, reset };
}
