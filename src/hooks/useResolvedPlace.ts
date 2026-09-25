import { useEffect, useRef, useState } from "react";

import type { GeoCoordinates, LocationFix } from "@/types";
import {
  REVERSE_GEOCODE_ATTRIBUTION,
  reverseGeocode,
  type ReverseGeocodeFailureReason,
  type ReverseGeocodeOutcome,
} from "@/services/location/reverseGeocodeService";

/**
 * useResolvedPlace (Task 1) — turns ONE already-acquired fix into an optional
 * human-readable place label.
 *
 * Deliberately passive:
 *  - it never acquires location (that stays `useGeolocation` + locationService,
 *    one-shot and user-initiated);
 *  - it never calls `watchPosition`, never polls, never re-requests on a timer;
 *  - it performs exactly one lookup per distinct fix, and reuses the answer if
 *    the same coordinates come back.
 *
 * On any failure the coordinates remain the honest fallback — the hook reports
 * that no readable name is available and never invents one.
 *
 * The published status is DERIVED from the current fix and the stored answer
 * rather than synced into state, so a lookup can never leave the UI stuck in a
 * state that disagrees with the fix on screen.
 */

export type ResolvedPlaceStatus = "idle" | "resolving" | "resolved" | "unavailable";

export interface ResolvedPlaceState {
  /** Real service text, or null — never a placeholder or a guess. */
  label: string | null;
  status: ResolvedPlaceStatus;
  /** Attribution to display alongside the label (null until a label exists). */
  attribution: string | null;
  /** Why no label exists, for honest feedback copy. */
  reason: ReverseGeocodeFailureReason | null;
}

export type PlaceResolver = (coordinates: GeoCoordinates) => Promise<ReverseGeocodeOutcome>;

const IDLE: ResolvedPlaceState = {
  label: null,
  status: "idle",
  attribution: null,
  reason: null,
};

const RESOLVING: ResolvedPlaceState = {
  label: null,
  status: "resolving",
  attribution: null,
  reason: null,
};

function fixKey(fix: LocationFix | null): string | null {
  if (fix === null) return null;
  return `${fix.coordinates.latitude},${fix.coordinates.longitude}`;
}

interface StoredAnswer {
  key: string;
  outcome: ReverseGeocodeOutcome;
}

export function useResolvedPlace(
  fix: LocationFix | null,
  resolve: PlaceResolver = reverseGeocode,
): ResolvedPlaceState {
  const [answer, setAnswer] = useState<StoredAnswer | null>(null);
  /** The fix already looked up — one lookup per fix, never a repeat. */
  const requested = useRef<string | null>(null);
  /** The fix whose answer is still wanted; anything else is stale by definition. */
  const active = useRef<string | null>(null);

  const key = fixKey(fix);

  useEffect(() => {
    if (fix === null || key === null) {
      // Invalidate any in-flight answer: there is no current fix to describe.
      active.current = null;
      return;
    }
    if (requested.current === key) return;
    requested.current = key;
    active.current = key;

    void resolve(fix.coordinates).then((outcome) => {
      // The user has since acquired a different fix (or cleared it): an answer
      // for the previous coordinate must never be shown as the current place.
      if (active.current !== key) return;
      setAnswer({ key, outcome });
    });
  }, [fix, key, resolve]);

  if (fix === null || key === null) return IDLE;
  if (answer === null || answer.key !== key) return RESOLVING;

  if (answer.outcome.place === null) {
    return {
      label: null,
      status: "unavailable",
      attribution: null,
      reason: answer.outcome.reason,
    };
  }

  return {
    label: answer.outcome.place.label,
    status: "resolved",
    attribution: answer.outcome.place.attribution ?? REVERSE_GEOCODE_ATTRIBUTION,
    reason: null,
  };
}
