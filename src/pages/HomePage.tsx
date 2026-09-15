import { Link } from "react-router";
import type { JSX } from "react";

import { GUIDE_LIST } from "@/data/firstAid";
import { Card } from "@/components/Card";
import { Icon } from "@/components/icons";
import { Button, ButtonLink } from "@/components/Button";
import { useGeolocation } from "@/hooks/useGeolocation";
import { describeAccuracy, formatTimestamp } from "@/utils/format";
import { isFresh } from "@/services/location/locationService";
import styles from "@/pages/HomePage.module.css";

const QUICK_TIPS = [
  "Keep calm and act fast.",
  "Ensure the victim is in a safe place.",
  "Do not move the victim unnecessarily.",
  "Call for professional medical help.",
];

import { assetPath } from "@/utils/paths";

export function HomePage(): JSX.Element {
  const geo = useGeolocation();

  return (
    <div className={styles.page}>
      {/* ------------------------------------------------------------- hero */}
      <section className={styles.hero}>
        <div className={styles.heroOverlay} aria-hidden="true" />
        <img
          src={assetPath("/images/lifeguard360-hero.jpg")}
          alt=""
          className={styles.heroImage}
          loading="eager"
        />
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

      <div className={styles.homeGrid}>
        {/* ------------------------------------------------- main column */}
        <div className={styles.homeMain}>
          <section aria-labelledby="situations-heading">
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
                      <img src={assetPath(guide.image)} alt="" loading="lazy" width={72} height={56} />
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

          {/* Your Location — honest one-shot state (no fake coordinates) */}
          <div className={styles.infoRow}>
            <Card title="Your Location" titleIcon="map-pin">
              <div className={styles.locationBody}>
                {geo.fix === null ? (
                  <>
                    <p className={styles.locationHint}>
                      Location is acquired one-shot, only when you ask — never tracked in the
                      background.
                    </p>
                    <Button
                      variant="success"
                      icon="map-pin"
                      disabled={geo.status === "requesting"}
                      onClick={() => void geo.requestFix()}
                    >
                      {geo.status === "requesting" ? "Locating…" : "Find Nearby Hospitals"}
                    </Button>
                    {geo.message !== null && (
                      <p role="alert" className={styles.locationError}>
                        {geo.message}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className={styles.locationCoords}>
                      {geo.fix.coordinates.latitude.toFixed(5)}°,{" "}
                      {geo.fix.coordinates.longitude.toFixed(5)}°
                    </p>
                    <p className={styles.locationMeta}>
                      {describeAccuracy(geo.fix.accuracy)} (±{Math.round(geo.fix.accuracy)} m) ·{" "}
                      {isFresh(geo.fix) ? "fresh" : "stale"} · {formatTimestamp(geo.fix.timestamp)}
                    </p>
                    <ButtonLink href="/facilities" variant="success" icon="facility">
                      Find Nearby Hospitals
                    </ButtonLink>
                  </>
                )}
              </div>
            </Card>

            <Card
              title="Nearby Hospitals"
              titleIcon="facility"
              actions={
                <ButtonLink href="/facilities" variant="ghost">
                  View All
                </ButtonLink>
              }
            >
              <p className={styles.hospitalsHint}>
                Verified hospitals and clinics near your current location, with distance,
                directions and phone where available.
              </p>
              <ButtonLink href="/facilities" variant="outline" icon="search">
                Search facilities
              </ButtonLink>
            </Card>
          </div>
        </div>

        {/* -------------------------------------------------- right rail */}
        <aside className={styles.homeAside}>
          <section className={styles.alertPanel} aria-labelledby="alert-heading">
            <img
              src={assetPath("/images/emergency-response.jpg")}
              alt="Paramedics loading a patient into an ambulance"
              className={styles.alertImage}
              width={480}
              height={140}
              loading="lazy"
            />
            <h2 id="alert-heading" className={styles.alertTitle}>
              <Icon name="bell" size={18} /> Emergency Alert
            </h2>
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
            <ButtonLink href="/get-help" variant="danger" size="lg" icon="share" block>
              Send Alert Now
            </ButtonLink>
            <p className={styles.alertFoot}>
              Opens Get Help Now — your device delivers the alert; Lifeguard360 prepares it.
            </p>
          </section>

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
            <ButtonLink href="/contacts" variant="success" icon="contacts" block>
              Set up contacts
            </ButtonLink>
          </Card>
        </aside>
      </div>
    </div>
  );
}
