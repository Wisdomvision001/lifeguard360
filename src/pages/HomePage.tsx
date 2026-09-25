import { useState, type JSX } from "react";
import { Link } from "react-router";

import { GUIDE_LIST } from "@/data/firstAid";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Icon } from "@/components/icons";
import { Button, ButtonLink } from "@/components/Button";
import { LocationMap, toMapFacility } from "@/components/LocationMap";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useResolvedPlace } from "@/hooks/useResolvedPlace";
import {
  formatCoordinateMeta,
  formatCoordinates,
  formatDistance,
  formatTimestamp,
} from "@/utils/format";
import { isFresh } from "@/services/location/locationService";
import {
  REVERSE_GEOCODE_ATTRIBUTION,
  REVERSE_GEOCODE_DISCLOSURE,
} from "@/services/location/reverseGeocodeService";
import { facilityDirectionsUrl } from "@/services/facilities/facilityService";
import {
  discoverNearbyFacilities,
  type NearbyDiscoveryOutcome,
} from "@/services/facilities/nearbyDiscoveryService";
import { overpassProvider } from "@/services/facilities/overpassProvider";
import { assetPath } from "@/utils/paths";
import styles from "@/pages/HomePage.module.css";

const QUICK_TIPS = [
  "Keep calm and act fast.",
  "Ensure the victim is in a safe place.",
  "Do not move the victim unnecessarily.",
  "Call for professional medical help.",
];

/** Home preview list/map size — the full list lives on /facilities. */
const HOME_FACILITY_LIMIT = 3;
const HOME_MAP_FACILITY_LIMIT = 10;

export function HomePage(): JSX.Element {
  const geo = useGeolocation();
  // Readable location description for the acquired fix: one lookup per fix,
  // no tracking, and coordinates stay the fallback when no label is available.
  const place = useResolvedPlace(geo.fix);
  const [discovery, setDiscovery] = useState<NearbyDiscoveryOutcome | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const discoveredFacilities = discovery?.facilities ?? [];
  const nearbyFacilities = discoveredFacilities.slice(0, HOME_FACILITY_LIMIT);
  const mapFacilities = discoveredFacilities.slice(0, HOME_MAP_FACILITY_LIMIT).map(toMapFacility);

  /**
   * One-shot facility preview. Location is acquired only from this explicit
   * action (never automatically), and discovery searches from the user's own
   * coordinates and widens itself if nothing nearby is found — no radius is
   * chosen here and none is filtered on.
   */
  const findNearbyHospitals = async (): Promise<void> => {
    setSearchError(null);
    const fix = geo.fix ?? (await geo.requestFix());
    if (fix === null) {
      setDiscovery(null);
      return;
    }
    setSearching(true);
    try {
      setDiscovery(await discoverNearbyFacilities(fix.coordinates, overpassProvider));
    } catch (error) {
      setDiscovery(null);
      setSearchError(error instanceof Error ? error.message : "Facility search failed.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className={styles.page}>
      {/*
        Locked Home structure (3 tracks):
        row 1 — hero (2 tracks) · emergency alert
        row 2 — emergency situations (2 tracks) · quick first aid tips
        row 3 — your location + nearby hospitals (2 tracks) · emergency contact
      */}
      <div className={styles.homeGrid}>
        {/* ------------------------------------------------------------- hero */}
        <section className={styles.hero}>
          <img
            src={assetPath("/images/lifeguard360-hero.jpg")}
            alt=""
            className={styles.heroImage}
            loading="eager"
          />
          <div className={styles.heroOverlay} aria-hidden="true" />
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>
              Your Safety Companion in <em>Emergencies</em>
            </h1>
            <p className={styles.heroSubtitle}>
              Quick guidance. Life-saving steps. Help is closer than you think.
            </p>
            <div className={styles.heroActions}>
              <ButtonLink href="/get-help" variant="danger" size="lg" icon="bell">
                Get Help Now
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- emergency alert */}
        <section className={styles.alertPanel} aria-labelledby="alert-heading">
          <h2 id="alert-heading" className={styles.alertTitle}>
            <Icon name="bell" size={18} /> Emergency Alert
          </h2>
          <img
            src={assetPath("/images/emergency-response.jpg")}
            alt="Paramedics loading a patient into an ambulance"
            className={styles.alertImage}
            loading="lazy"
          />
          <div className={styles.alertBody}>
            <span className={styles.alertIcon} aria-hidden="true">
              <Icon name="map-pin" size={22} />
            </span>
            <div>
              <p className={styles.alertHeading}>Share Your Location</p>
              <p className={styles.alertCopy}>
                Send your location to your emergency contacts with one tap.
              </p>
            </div>
          </div>
          <div className={styles.alertAction}>
            <ButtonLink href="/get-help" variant="danger" icon="share" block>
              Send Alert Now
            </ButtonLink>
          </div>
          <p className={styles.alertStatus}>
            {geo.fix === null ? (
              <>
                <span className={styles.dotIdle} aria-hidden="true" />
                Location is acquired only when you send an alert.
              </>
            ) : (
              <>
                <span className={styles.dotReady} aria-hidden="true" />
                Location acquired · ±{Math.round(geo.fix.accuracy)} m ·{" "}
                {isFresh(geo.fix) ? "fresh" : "stale"}
              </>
            )}
          </p>
          <p className={styles.alertFoot}>
            Opens Get Help Now — your device delivers the alert; Lifeguard360 prepares it.
          </p>
        </section>

        {/* ------------------------------------------------ emergency situations */}
        <section className={styles.situations} aria-labelledby="situations-heading">
          <div className={styles.sectionHeading}>
            <h2 id="situations-heading">
              <Icon name="sos" size={22} /> Emergency Situations
            </h2>
            <span className={styles.sectionHint}>Choose a situation below:</span>
          </div>

          <div className={styles.emergencyGrid}>
            {GUIDE_LIST.map((guide) => (
              <Link
                key={guide.id}
                to={`/first-aid/${guide.id}`}
                className={styles.emergencyCard}
              >
                {guide.image !== undefined && (
                  <span className={styles.emergencyThumb} aria-hidden="true">
                    <img src={assetPath(guide.image)} alt="" loading="lazy" />
                  </span>
                )}
                <span className={styles.emergencyBody}>
                  <span className={styles.emergencyTitle}>{guide.label}</span>
                  <span className={styles.emergencyDesc}>{guide.summary}</span>
                </span>
                <Icon name="chevron" size={18} className={styles.emergencyChevron} />
              </Link>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------- quick first aid tips */}
        <Card
          title="Quick First Aid Tips"
          titleIcon="first-aid"
          className={styles.tipsCard}
          actions={
            <ButtonLink href="/first-aid" variant="ghost">
              View All
            </ButtonLink>
          }
        >
          <ul className={styles.tipList}>
            {QUICK_TIPS.map((tip) => (
              <li key={tip}>
                <Icon name="check" size={14} className={styles.tipCheck} />
                {tip}
              </li>
            ))}
          </ul>
          <ButtonLink href="/first-aid" variant="primary" block>
            View Full First Aid Guide
          </ButtonLink>
        </Card>

        {/* --------------------------- location + nearby hospitals (2 tracks) */}
        <div className={styles.bottomRow}>
          <Card title="Your Location" titleIcon="map-pin" className={styles.locationCard}>
            {geo.fix === null ? (
              <div className={styles.locationEmpty}>
                <p className={styles.locationHint}>
                  Location is acquired one-shot, only when you ask — never tracked in the
                  background.
                </p>
                <Button
                  variant="success"
                  icon="map-pin"
                  disabled={geo.status === "requesting"}
                  onClick={() => void findNearbyHospitals()}
                >
                  {geo.status === "requesting" ? "Locating…" : "Find Nearby Hospitals"}
                </Button>
                {geo.message !== null && (
                  <p role="alert" className={styles.locationError}>
                    {geo.message}
                  </p>
                )}
              </div>
            ) : (
              <div className={styles.locationBody}>
                {/* Primary: the real OpenStreetMap description once it exists —
                    until then the coordinates are shown, never a placeholder. */}
                <p className={styles.locationCoords}>
                  {place.label ?? formatCoordinates(geo.fix.coordinates)}
                </p>
                {/* Secondary: coordinates + accuracy remain visible either way. */}
                <p className={styles.locationMeta}>
                  {formatCoordinateMeta(geo.fix)} · {isFresh(geo.fix) ? "fresh" : "stale"} ·{" "}
                  {formatTimestamp(geo.fix.timestamp)}
                </p>
                {place.status === "resolving" && (
                  <p className={styles.locationHint} role="status">
                    Finding a readable location name for these coordinates…
                  </p>
                )}
                {place.status === "unavailable" && (
                  <p className={styles.locationHint} role="status">
                    Location acquired, but a readable location name could not be determined —
                    showing coordinates.
                  </p>
                )}
                {place.label !== null && (
                  <p className={styles.attribution}>
                    {REVERSE_GEOCODE_ATTRIBUTION} {REVERSE_GEOCODE_DISCLOSURE}
                  </p>
                )}
                <div className={styles.mapFrame}>
                  <LocationMap location={geo.fix} facilities={mapFacilities} />
                </div>
                <ButtonLink href="/facilities" variant="success" icon="facility">
                  Find Nearby Hospitals
                </ButtonLink>
              </div>
            )}
          </Card>

          <Card
            title="Nearby Hospitals"
            titleIcon="facility"
            className={styles.hospitalsCard}
            actions={
              <ButtonLink href="/facilities" variant="ghost">
                View All
              </ButtonLink>
            }
          >
            {nearbyFacilities.length > 0 ? (
              <ul className={styles.facilityList}>
                {nearbyFacilities.map((facility) => (
                  <li key={facility.id} className={styles.facilityItem}>
                    <div className={styles.facilityBody}>
                      <p className={styles.facilityNameRow}>
                        <span className={styles.facilityName}>{facility.name}</span>
                        <Badge tone={facility.trust === "verified" ? "success" : "blue"} dot>
                          {facility.trust === "verified" ? "Verified" : "OSM"}
                        </Badge>
                      </p>
                      <p className={styles.facilityMeta}>
                        {facility.category} · {formatDistance(facility.distanceMeters)}
                        {facility.openingHours !== undefined && ` · ${facility.openingHours}`}
                      </p>
                    </div>
                    <a
                      className={styles.directionsLink}
                      href={facilityDirectionsUrl(facility)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Directions
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.hospitalsHint}>
                {discovery !== null
                  ? (discovery.note ?? "No facilities were found nearby.")
                  : searching
                    ? "Searching from your current location — widening the search if nothing is found nearby."
                    : "Hospitals and clinics near your current location, ordered by distance. Lifeguard360-verified records and OpenStreetMap results are labelled."}
              </p>
            )}

            {mapFacilities.some((facility) => facility.trust === "dynamic") && (
              <p className={styles.attribution}>
                OpenStreetMap results © OpenStreetMap contributors (ODbL).
              </p>
            )}

            {searchError !== null && (
              <p role="alert" className={styles.locationError}>
                {searchError}
              </p>
            )}

            <div className={styles.hospitalsActions}>
              <Button
                variant="outline"
                icon="search"
                disabled={searching}
                onClick={() => void findNearbyHospitals()}
              >
                {searching ? "Searching…" : "Search facilities"}
              </Button>
            </div>
          </Card>
        </div>

        {/* ------------------------------------------------ emergency contact */}
        <Card
          title="Emergency Contact"
          titleIcon="phone"
          className={styles.contactCard}
          actions={
            <ButtonLink href="/contacts" variant="ghost">
              Manage
            </ButtonLink>
          }
        >
          <p className={styles.contactHint}>
            Add trusted contacts so help is one tap away in an emergency. Contacts are private to
            your account.
          </p>
          <div className={styles.contactActions}>
            <ButtonLink href="/contacts" variant="success" icon="contacts" block>
              Set up contacts
            </ButtonLink>
            <ButtonLink href="/get-help" variant="danger" icon="bell" block>
              Get Help Now
            </ButtonLink>
          </div>
        </Card>
      </div>
    </div>
  );
}
