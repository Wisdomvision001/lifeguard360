import { collection, getDocs } from "firebase/firestore";

import type { Facility, FacilityWithDistance } from "@/types";
import { getDb, isFirebaseConfigured } from "@/services/firebase/client";
import { describeFirebaseError } from "@/services/firebase/db";
import { distanceMeters } from "@/utils/format";
import type { GeoCoordinates } from "@/types";

/**
 * FacilitySearchService (Phase 6) — provider-agnostic by design (AD-12).
 *
 * MVP runtime source: the verified `facilities` collection in Firestore,
 * populated through the data-preparation pipeline (Overpass allowed for
 * dev/prep only; Google Places enrichment is a gated decision).
 *
 * The UI never queries a provider directly — it calls this service.
 * When no verified data exists the service returns an empty list and the UI
 * must show an honest empty state. Fabricated facility lists are forbidden.
 */

export interface FacilitySearchResult {
  facilities: FacilityWithDistance[];
  source: "firestore" | "none";
  note: string | null;
}

export async function listVerifiedFacilities(): Promise<Facility[]> {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Facility data is unavailable because Firebase is not configured in this environment.",
    );
  }
  try {
    const db = getDb();
    const snapshot = await getDocs(collection(db, "facilities"));
    return snapshot.docs
      .map((docSnapshot) => {
        const data = docSnapshot.data() as Record<string, unknown>;
        const coordinates = (data.coordinates ?? {}) as Partial<GeoCoordinates>;
        return {
          id: docSnapshot.id,
          name: typeof data.name === "string" ? data.name : "Unnamed facility",
          category: typeof data.category === "string" ? data.category : "facility",
          coordinates: {
            latitude: typeof coordinates.latitude === "number" ? coordinates.latitude : 0,
            longitude: typeof coordinates.longitude === "number" ? coordinates.longitude : 0,
          },
          phone: typeof data.phone === "string" ? data.phone : undefined,
          openingHours: typeof data.openingHours === "string" ? data.openingHours : undefined,
          verified: data.verified === true,
          source: typeof data.source === "string" ? data.source : "unknown",
          updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
        } satisfies Facility;
      })
      // The function name is the contract: only verified records are exposed
      // publicly (docs/DATASET-CONTRACT.md §3).
      .filter((facility) => facility.verified);
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

/** Nearby search: verified dataset filtered by an honest distance bound. */
export async function findNearbyFacilities(
  from: GeoCoordinates,
  radiusMeters = 10000,
): Promise<FacilitySearchResult> {
  const facilities = await listVerifiedFacilities();
  const withDistance = facilities
    .filter(
      (facility) => facility.coordinates.latitude !== 0 || facility.coordinates.longitude !== 0,
    )
    .map((facility) => ({
      ...facility,
      distanceMeters: distanceMeters(from, facility.coordinates),
    }))
    .filter((facility) => facility.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  if (facilities.length === 0) {
    return {
      facilities: [],
      source: "none",
      note: "No verified facility data has been published yet. Facility discovery will become available once verified data is loaded.",
    };
  }
  if (withDistance.length === 0) {
    return {
      facilities: [],
      source: "firestore",
      note: "No verified facilities were found within the search radius.",
    };
  }
  return { facilities: withDistance, source: "firestore", note: null };
}

/** Directions link (Google Maps) for a facility — display only. */
export function facilityDirectionsUrl(facility: Facility): string {
  const { latitude, longitude } = facility.coordinates;
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}
