import { useState, type FormEvent, type JSX } from "react";

import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Icon } from "@/components/icons";
import { useGeolocation } from "@/hooks/useGeolocation";
import {
  facilityDirectionsUrl,
  findNearbyFacilities,
  type FacilitySearchResult,
} from "@/services/facilities/facilityService";
import { isFirebaseConfigured } from "@/services/firebase/client";
import { formatDistance, describeAccuracy } from "@/utils/format";
import styles from "@/pages/FacilitiesPage.module.css";

/**
 * Find Nearby Healthcare Facilities (Phase 6).
 * Data comes exclusively from FacilitySearchService (verified Firestore
 * dataset). The UI never talks to a provider directly, and shows honest
 * empty/error states — fabricated facility lists are forbidden.
 */
export function FacilitiesPage(): JSX.Element {
  const geo = useGeolocation();
  const [result, setResult] = useState<FacilitySearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [radiusMeters, setRadiusMeters] = useState(10000);
  const [searchError, setSearchError] = useState<string | null>(null);

  const configured = isFirebaseConfigured();

  const runSearch = async (): Promise<void> => {
    setSearchError(null);
    const fix = geo.fix ?? (await geo.requestFix());
    if (fix === null) {
      setResult(null);
      return;
    }
    setLoading(true);
    try {
      const searchResult = await findNearbyFacilities(fix.coordinates, radiusMeters);
      setResult(searchResult);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Facility search failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (event: FormEvent): void => {
    event.preventDefault();
    void runSearch();
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Find Nearby Healthcare Facilities</h1>
        <p>
          Verified hospitals and clinics near your current location. Location is acquired one-shot,
          only when you search — never tracked in the background.
        </p>
      </header>

      <Card>
        <form className={styles.searchForm} onSubmit={handleFormSubmit}>
          <label className={styles.radiusLabel}>
            Search radius
            <select
              value={radiusMeters}
              onChange={(event) => {
                // Reset results inline so the stale list is never presented
                // as if it answered the new radius query.
                setResult(null);
                setRadiusMeters(Number(event.target.value));
              }}
            >
              <option value={2000}>2 km</option>
              <option value={5000}>5 km</option>
              <option value={10000}>10 km</option>
              <option value={25000}>25 km</option>
            </select>
          </label>
          <Button type="submit" icon="search" disabled={loading} className={styles.searchButton}>
            {loading ? "Searching…" : geo.fix === null ? "Find facilities near me" : "Search again"}
          </Button>
        </form>

        {geo.fix !== null && (
          <p className={styles.fixInfo}>
            Using location {geo.fix.coordinates.latitude.toFixed(5)},{" "}
            {geo.fix.coordinates.longitude.toFixed(5)} ({describeAccuracy(geo.fix.accuracy)}, ±
            {Math.round(geo.fix.accuracy)} m)
          </p>
        )}
        {geo.message !== null && (
          <p role="alert" className={styles.searchError}>
            {geo.message}
          </p>
        )}
        {searchError !== null && (
          <p role="alert" className={styles.searchError}>
            {searchError}
          </p>
        )}
      </Card>

      {!configured && (
        <Card title="Facility data unavailable" titleIcon="alert">
          <p>
            Facility discovery is unavailable because Firebase is not configured in this
            environment. Add your Firebase project values to <code>.env.local</code> (see{" "}
            <code>.env.example</code>) and reload.
          </p>
        </Card>
      )}

      {configured && result !== null && result.source === "none" && (
        <Card title="No verified facility data yet" titleIcon="alert">
          <p role="status">{result.note}</p>
        </Card>
      )}

      {configured &&
        result !== null &&
        result.facilities.length === 0 &&
        result.source === "firestore" && (
          <Card title="Nothing found in this radius" titleIcon="alert">
            <p role="status">{result.note}</p>
          </Card>
        )}

      {result !== null && result.facilities.length > 0 && (
        <section aria-label="Nearby facilities" className={styles.results}>
          <div className={styles.resultsHeader}>
            <h2>
              {result.facilities.length} facility{result.facilities.length === 1 ? "" : "s"} found
            </h2>
            <Badge tone="blue">Verified data · Firestore</Badge>
          </div>
          <ul className={styles.facilityList}>
            {result.facilities.map((facility) => (
              <li key={facility.id} className={styles.facilityCard}>
                <div className={styles.facilityBody}>
                  <h3>{facility.name}</h3>
                  <p className={styles.facilityMeta}>
                    {facility.category} · {formatDistance(facility.distanceMeters)}
                    {facility.openingHours !== undefined && ` · ${facility.openingHours}`}
                  </p>
                  {facility.phone !== undefined && (
                    <a className={styles.facilityPhone} href={`tel:${facility.phone}`}>
                      <Icon name="phone" size={14} />
                      {facility.phone}
                    </a>
                  )}
                </div>
                <a
                  className={styles.directionsLink}
                  href={facilityDirectionsUrl(facility)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="external" size={16} />
                  Directions
                </a>
              </li>
            ))}
          </ul>
          <p className={styles.attribution}>
            Facility records are verified entries maintained in the project database. Map links open
            in Google Maps.
          </p>
        </section>
      )}
    </div>
  );
}
