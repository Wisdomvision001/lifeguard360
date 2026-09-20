import { useEffect, useMemo, useState, type JSX } from "react";
import { Link } from "react-router";

import { useAuth } from "@/app/providers/AuthProvider";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Icon } from "@/components/icons";
import { listContacts } from "@/services/contacts/contactService";
import { listDemoContacts } from "@/services/contacts/demoContactStore";
import { logActivity } from "@/services/activity/activityService";
import {
  PRECONDITIONS_NOTICE,
  describeState,
  initiateCall,
  prepareEmergencySms,
} from "@/services/communication/communicationService";
import { isFresh } from "@/services/location/locationService";
import { describeAccuracy, formatTimestamp } from "@/utils/format";
import type { EmergencyContact, PreparedSms } from "@/types";
import styles from "@/pages/GetHelpPage.module.css";

/**
 * Get Help Now (Phase 7) — the individual-user emergency assistance center.
 * NOT an emergency dispatch request: every action prepares something on the
 * user's own device, and the UI only ever claims what actually happened
 * (prepared ≠ sent ≠ delivered, AD-7).
 */
import { assetPath } from "@/utils/paths";

export function GetHelpPage(): JSX.Element {
  const { authState } = useAuth();
  const uid = authState.status === "signed-in" ? (authState.user?.uid ?? null) : null;
  const geo = useGeolocation();

  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [includeLocation, setIncludeLocation] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [smsPreview, setSmsPreview] = useState<PreparedSms | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (uid === null) return; // guests: no account data to load
    let cancelled = false;
    listContacts(uid)
      .then((loaded) => {
        if (cancelled) return;
        setContacts(loaded);
        setSelectedId(loaded[0]?.id ?? null);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Could not load your contacts.");
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Guests cannot own Firestore contacts; derive instead of storing per-uid
  // state in an effect, so the UI never hangs on a spinner it can never
  // resolve. Guest contacts come from the SAME browser-local demo store the
  // Contacts page maintains — listDemoContacts() is a synchronous, defensive
  // localStorage read: no Firestore call, and the derived state resolves
  // deterministically on first render (no loading loop is possible).
  const demoContacts = useMemo(() => (uid === null ? listDemoContacts() : []), [uid]);
  const effectiveContacts = uid === null ? demoContacts : contacts;
  const effectiveLoadState = uid === null ? ("ready" as const) : loadState;
  const effectiveLoadError = uid === null ? null : loadError;

  // Guest selection defaults to the first demo contact so the emergency
  // actions are immediately reachable. The authenticated selection behaviour
  // is unchanged (the effect below pre-selects the first loaded contact).
  const effectiveSelectedId =
    selectedId !== null && effectiveContacts.some((contact) => contact.id === selectedId)
      ? selectedId
      : uid === null
        ? (effectiveContacts[0]?.id ?? null)
        : null;
  const selected =
    effectiveContacts.find((contact) => contact.id === effectiveSelectedId) ?? null;

  const handleCall = (): void => {
    if (selected === null) return;
    const state = initiateCall(selected);
    setNotice(
      `Your phone dialer has opened for ${selected.fullName}. Place the call from your device.`,
    );
    if (uid !== null) {
      void logActivity(uid, "emergency_action", {
        action: "call_initiated",
        contactId: selected.id,
        observedState: state,
      });
    }
  };

  const handlePrepareSms = async (): Promise<void> => {
    if (selected === null) return;
    setBusy(true);
    setNotice(null);
    setSmsPreview(null);
    try {
      let fix = geo.fix;
      if (includeLocation && (fix === null || !isFresh(fix))) {
        fix = await geo.requestFix();
      }
      const effectiveFix = includeLocation ? fix : null;
      const prepared = prepareEmergencySms({
        contact: selected,
        fix: effectiveFix,
        uid,
      });
      setSmsPreview(prepared);
      setNotice(describeState(prepared.state));
    } finally {
      setBusy(false);
    }
  };

  const handleShareLocation = async (): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      const fix = await geo.requestFix();
      setNotice(
        fix === null
          ? (geo.message ?? "Your location could not be determined.")
          : "Location acquired. It is shown below and is only used when you include it in an action.",
      );
      if (uid !== null && fix !== null) {
        void logActivity(uid, "location_shared", {
          via: "get-help",
          coordinates: fix.coordinates,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerMedia}>
          <img
            src={assetPath("/images/emergency-help.jpg")}
            alt="Emergency responders assisting a person on a stretcher"
            className={styles.headerImage}
            width={1200}
            height={800}
          />
          <span className={styles.bellBadge} aria-hidden="true">
            <Icon name="bell" size={26} />
          </span>
        </div>
        <h1>Emergency Alert</h1>
        <p>
          Send your location and alert your emergency contacts. Lifeguard360 prepares calls and
          messages — your phone, SIM and mobile network deliver them.
        </p>
      </header>

      <section className={styles.includesCard} aria-labelledby="includes-heading">
        <h2 id="includes-heading">Alert will include:</h2>
        <ul className={styles.includesList}>
          <li>
            <Icon name="map-pin" size={18} className={styles.includesIcon} />
            <div>
              <strong>Your current location</strong>
              <span>GPS coordinates as a map link (if you include it)</span>
            </div>
          </li>
          <li>
            <Icon name="sos" size={18} className={styles.includesIcon} />
            <div>
              <strong>Your chosen contact</strong>
              <span>One trusted contact per alert</span>
            </div>
          </li>
          <li>
            <Icon name="history" size={18} className={styles.includesIcon} />
            <div>
              <strong>Time &amp; date</strong>
              <span>When the message was prepared</span>
            </div>
          </li>
        </ul>
      </section>

      <Card title="Before you continue" titleIcon="alert" className={styles.preconditions}>
        <p>{PRECONDITIONS_NOTICE}</p>
      </Card>

      {uid === null && (
        <Card title="Demo mode — saved in this browser only" titleIcon="contacts">
          <p>
            You are not signed in, so the contacts shown here come from this browser's local demo
            storage — nothing is sent to Firestore. Signing in later does not move demo contacts
            into an account. Sign in to store contacts safely in your account.
          </p>
        </Card>
      )}

      {effectiveLoadState === "loading" && (
        <Card>
          <p aria-busy="true">Loading your emergency contacts…</p>
        </Card>
      )}

      {effectiveLoadState === "error" && (
        <Card title="Contacts unavailable" titleIcon="alert">
          <p role="alert">{effectiveLoadError}</p>
        </Card>
      )}

      {effectiveLoadState === "ready" && effectiveContacts.length === 0 && (
        <Card title="No emergency contacts yet" titleIcon="contacts">
          <p>
            Add at least one trusted contact before an emergency happens.{" "}
            <Link to="/contacts">Add an emergency contact</Link>.
          </p>
        </Card>
      )}

      {effectiveLoadState === "ready" && effectiveContacts.length > 0 && (
        <div className={styles.grid}>
          <div className={styles.main}>
            <Card title="Choose a trusted contact" titleIcon="contacts">
              <div className={styles.contactPicker} role="radiogroup" aria-label="Trusted contact">
                {effectiveContacts.map((contact) => (
                  <label
                    key={contact.id}
                    className={`${styles.contactOption} ${
                      contact.id === selectedId ? styles.contactOptionActive : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="emergency-contact"
                      value={contact.id}
                      checked={contact.id === effectiveSelectedId}
                      onChange={() => setSelectedId(contact.id)}
                    />
                    <span className={styles.contactName}>{contact.fullName}</span>
                    <span className={styles.contactMeta}>
                      {contact.relationship} · {contact.phoneNumber}
                    </span>
                  </label>
                ))}
              </div>
            </Card>

            <Card title="Send emergency SMS" titleIcon="message">
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={includeLocation}
                  onChange={(event) => setIncludeLocation(event.target.checked)}
                />
                <span>Include my current location as a map link (asks for permission)</span>
              </label>
              <p className={styles.stepHint}>
                Your messaging app opens with the message prepared. You review and send it —
                Lifeguard360 does not send SMS itself.
              </p>
              <Button
                variant="danger"
                size="lg"
                icon="message"
                disabled={busy || selected === null}
                onClick={() => void handlePrepareSms()}
              >
                Prepare emergency SMS
              </Button>
              {smsPreview !== null && (
                <div className={styles.smsPreview}>
                  <p className={styles.smsPreviewTitle}>
                    <Badge tone="amber" dot>
                      Message prepared — not sent
                    </Badge>
                  </p>
                  <pre aria-label="Prepared message text">{smsPreview.body}</pre>
                  <p className={styles.smsPreviewTo}>
                    To: {smsPreview.to} · review and send it in your messaging app.
                  </p>
                </div>
              )}
            </Card>

            <Card title="Call trusted contact" titleIcon="phone">
              <p className={styles.stepHint}>
                Opens your device dialer with the contact's number. The call is handled by your
                device, SIM and mobile network — airtime and coverage apply.
              </p>
              <Button
                variant="primary"
                size="lg"
                icon="phone"
                disabled={busy || selected === null}
                onClick={handleCall}
              >
                Call {selected !== null ? selected.fullName : "contact"}
              </Button>
            </Card>
          </div>

          <aside className={styles.aside}>
            <Card title="Share location" titleIcon="map-pin">
              <p className={styles.stepHint}>
                One-shot only: your browser asks for permission each time you request a fix. Nothing
                is tracked in the background.
              </p>
              <Button
                variant="outline"
                icon="map-pin"
                disabled={busy}
                onClick={() => void handleShareLocation()}
              >
                Get my location
              </Button>
              {geo.fix !== null && (
                <div className={styles.locationResult}>
                  <p>
                    <strong>
                      {geo.fix.coordinates.latitude.toFixed(5)},{" "}
                      {geo.fix.coordinates.longitude.toFixed(5)}
                    </strong>
                  </p>
                  <p>
                    {describeAccuracy(geo.fix.accuracy)} (±{Math.round(geo.fix.accuracy)} m) ·{" "}
                    {isFresh(geo.fix) ? "fresh" : "stale"} · {formatTimestamp(geo.fix.timestamp)}
                  </p>
                </div>
              )}
              {geo.message !== null && (
                <p role="alert" className={styles.locationError}>
                  {geo.message}
                </p>
              )}
            </Card>

            <Card title="Nearby healthcare facilities" titleIcon="facility">
              <p className={styles.stepHint}>
                Find verified hospitals and clinics near you and get directions.
              </p>
              <Link to="/facilities" className={styles.facilityLink}>
                <Icon name="chevron" size={16} />
                Find nearby healthcare facilities
              </Link>
            </Card>

            {notice !== null && (
              <p className={styles.notice} aria-live="polite" role="status">
                {notice}
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
