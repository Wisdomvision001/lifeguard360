import type { CommunicationState, PreparedSms } from "@/types";

import { logActivity } from "@/services/activity/activityService";
import { formatDistance, mapsLink } from "@/utils/format";
import type { GeoCoordinates, LocationFix } from "@/types";

/**
 * EmergencyCommunicationService (Phase 7) — Call/SMS via the device's own
 * capabilities. Truthfulness contract (AD-7):
 *
 *   prepared ≠ sent ≠ delivered
 *
 * This service can only ever report "message-prepared" / "composer-opened".
 * It has no way to know whether the user actually sent the SMS, and no way
 * to know delivery — the UI must never claim either. Calls open the device
 * dialer; the network call itself belongs entirely to the user's device,
 * SIM and mobile network.
 */

export const PRECONDITIONS_NOTICE =
  "Before you continue, please check: your phone can make calls and SMS, your SIM has coverage and sufficient airtime/credit, and the contact's number is correct. Location sharing also requires browser location permission.";

export function buildEmergencySmsBody(fix: LocationFix | null, contactName: string): string {
  const lines = ["Emergency! I need assistance.", ""];
  if (fix) {
    lines.push(`My current location: ${mapsLink(fix.coordinates)}`);
    lines.push(`(accuracy: ${formatDistance(fix.accuracy)})`);
  } else {
    lines.push("My current location: [location not available — please call me]");
  }
  lines.push("", `— sent via Lifeguard360 for ${contactName}`);
  return lines.join("\n");
}

/** Open the device dialer for a contact. Returns the honest observed state. */
export function initiateCall(contact: {
  fullName: string;
  phoneNumber: string;
}): CommunicationState {
  const href = `tel:${contact.phoneNumber}`;
  window.location.href = href;
  return "composer-opened";
}

/**
 * Prepare an emergency SMS: opens the device messaging app with recipient and
 * body prefilled where the platform supports it. The user reviews and sends.
 */
export function prepareEmergencySms(input: {
  contact: { id: string; fullName: string; phoneNumber: string };
  fix: LocationFix | null;
  uid: string | null;
}): PreparedSms {
  const body = buildEmergencySmsBody(input.fix, input.contact.fullName);
  const to = input.contact.phoneNumber;
  const href = `sms:${to}?&body=${encodeURIComponent(body)}`;
  window.location.href = href;
  const state: CommunicationState = "composer-opened";  if (input.uid) {
    void logActivity(input.uid, "emergency_action", {
      action: "sms_prepared",
      contactId: input.contact.id,
      includedLocation: input.fix !== null,
    });
  }
  if (input.fix) {
    void logActivity(input.uid, "location_shared", {
      via: "sms",
      contactId: input.contact.id,
      coordinates: input.fix.coordinates as GeoCoordinates,
    });
  }
  return { state, to, body };
}

export function describeState(state: CommunicationState): string {
  switch (state) {
    case "action-available":
      return "Ready";
    case "preparing":
      return "Preparing…";
    case "message-prepared":
      return "Message prepared — review it in your messaging app.";
    case "composer-opened":
      return "Your messaging app has opened. Review the message and send it when ready.";
    case "unavailable":
      return "This action is not available on this device.";
    default:
      return "";
  }
}
