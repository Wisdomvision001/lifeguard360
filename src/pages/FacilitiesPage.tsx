import { useState, type FormEvent, type JSX } from "react";

import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Icon } from "@/components/icons";
import { LocationMap, toMapFacility } from "@/components/LocationMap";
import { useGeolocation } from "@/hooks/useGeolocation";
import { facilityDirectionsUrl } from "@/services/facilities/facilityService";
import {
  discoverNearbyFacilities,
  type NearbyDiscoveryOutcome,
} from "@/services/facilities/nearbyDiscoveryService";
import { overpassProvider } from "@/services/facilities/overpassProvider";
import { formatDistance, formatCoordinateMeta } from "@/utils/format";
import styles from "@/pages/FacilitiesPage.module.css";

/**
 * Find Nearby Healthcare Facilities.
 *
 * Location-driven discovery: the browser's current position is the only input.
 * There is deliberately NO radius control — the search starts local and widens
 * itself when the area is thin (see nearbyDiscoveryService), and the distance
 * shown on each facility is information, never an eligibility filter.
 *
 * Results come from the existing discovery pipeline: Lifeguard360-verified
 * Firestore records plus dynamically discovered OpenStreetMap records, each
 * labelled with its own trust. The UI never talks to a provider directly, and
 * shows honest empty/error states — fabricated facility lists are forbidden.
 */

/** Display cap: an honest "nearest N of M" list instead of an unbounded one. */
const DISPLAY_LIMIT = 30;
const MAP_LIMIT = 10;

export function FacilitiesPage(): JSX.Element {
  const geo = useGeolocation();
  const [result, setResult] = useState<NearbyDiscoveryOutcome | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const facilities = result?.facilities ?? [];
  const visible = facilities.slice(0, DISPLAY_LIMIT);
  const mapFacilities = facilities.slice(0, MAP_LIMIT).map(toMapFacility);
  const hasDynamic = facilities.some((facility) => facility.trust === "dynamic");

  const runSearch = async (): Promise<void> => {
    setSearchError(null);
    const fix = geo.fix ?? (await geo.requestFix());
    if (fix === null) {
      setResult(null);
      return;
    }
    setLoading(true);
    try {
      setResult(await discoverNearbyFacilities(fix.coordinates, overpassProvider));
    } catch (error) {
      setResult(null);
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
          Hospitals and clinics around your current location, ordered from nearest to furthest. Your
          location is acquired one-shot only when you search — never tracked in the background, and
          nothing about you is sent to the data provider. Distances are straight-line estimates, not
          a filter.
        </p>
      </header>

      <Card>
        <form className={styles.searchForm} onSubmit={handleFormSubmit}>
          <Button type="submit" icon="search" disabled={loading} className={styles.searchButton}>
            {loading ? "Searching…" : geo.fix === null ? "Find facilities near me" : "Search again"}
          </Button>
        </form>

        {geo.fix !== null && (
          <p className={styles.fixInfo}>
            Using location {formatCoordinateMeta(geo.fix)}
          </p>
        )}
        {loading && (
          <p className={styles.fixInfo}>
            Searching OpenStreetMap around your location — the search widens automatically if
            nothing is found nearby.
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

      {geo.fix !== null && (
        <section aria-label="Your location on a map">
          <LocationMap location={geo.fix} facilities={mapFacilities} />
        </section>
      )}

      {result !== null && (
        <Card title="Search status" titleIcon="alert">
          <p role="status">
            {result.note ??
              `Searched within ${Math.round(result.radiusMeters / 1000)} km of your current location.`}
          </p>
        </Card>
      )}

      {result !== null && facilities.length === 0 && (
        <Card title="No facilities found nearby" titleIcon="alert">
          <p>
            No hospitals or clinics could be found around your location, including after widening
            the search. This can happen where OpenStreetMap coverage is limited. Try again when you
            have a stronger location fix.
          </p>
        </Card>
      )}

      {visible.length > 0 && (
        <section aria-label="Nearby facilities" className={styles.results}>
          <div className={styles.resultsHeader}>
            <h2>
              {facilities.length} facilit{facilities.length === 1 ? "y" : "ies"} found
            </h2>
            <div className={styles.sourceChips}>
              {facilities.some((facility) => facility.trust === "verified") && (
                <Badge tone="success" dot>
                  Lifeguard360 verified
                </Badge>
              )}
              {hasDynamic && (
                <Badge tone="blue" dot>
                  OpenStreetMap discovered
                </Badge>
              )}
            </div>
          </div>
          <ul className={styles.facilityList}>
            {visible.map((facility) => (
              <li key={facility.id} className={styles.facilityCard}>
                <div className={styles.facilityBody}>
                  <h3>
                    {facility.name}
                    <span className={styles.facilityTrust}>
                      {facility.trust === "verified" ? "Verified" : "OSM"}
                    </span>
                  </h3>
                  <p className={styles.facilityMeta}>
                    {facility.category} · {formatDistance(facility.distanceMeters)}
                    {facility.openingHours !== undefined && ` · ${facility.openingHours}`}
                  </p>
                  {facility.address !== undefined && (
                    <p className={styles.facilityMeta}>{facility.address}</p>
                  )}
                  {facility.phone !== undefined && (
                    <a className={styles.facilityPhone} href={`tel:${facility.phone}`}>
                      <Icon name="phone" size={14} />
                      {facility.phone}
                    </a>
                  )}
                  {facility.sourceUrl !== undefined && (
                    <a
                      className={styles.facilityPhone}
                      href={facility.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Icon name="external" size={14} />
                      Source record
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
          {facilities.length > visible.length && (
            <p className={styles.attribution}>
              Showing the {visible.length} nearest of {facilities.length} facilities found. The map
              shows the {mapFacilities.length} nearest.
            </p>
          )}
          <p className={styles.attribution}>
            Lifeguard360-verified records are human-reviewed entries maintained in the project
            database. OpenStreetMap results are discovered live from your coordinates and are
            unreviewed data © OpenStreetMap contributors (ODbL). Map links open in Google Maps.
          </p>
        </section>
      )}
    </div>
  );
}
