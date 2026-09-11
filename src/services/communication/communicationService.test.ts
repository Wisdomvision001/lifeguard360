import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildEmergencySmsBody,
  describeState,
  initiateCall,
  prepareEmergencySms,
  PRECONDITIONS_NOTICE,
} from "@/services/communication/communicationService";
import type { LocationFix } from "@/types";

/** A deterministic location fix for tests. */
const FIX: LocationFix = {
  coordinates: { latitude: 6.5244, longitude: 3.3792 },
  accuracy: 25,
  timestamp: 1_700_000_000_000,
};

const CONTACT = { id: "c1", fullName: "Ada Obi", phoneNumber: "+2348012345678" };

describe("buildEmergencySmsBody", () => {
  it("includes the map link when a fix exists", () => {
    const body = buildEmergencySmsBody(FIX, "Ada Obi");
    expect(body).toContain("Emergency! I need assistance.");
    expect(body).toContain("https://maps.google.com/?q=6.524400,3.379200");
    expect(body).toContain("Ada Obi");
  });

  it("never fabricates a location when no fix exists", () => {
    const body = buildEmergencySmsBody(null, "Ada Obi");
    expect(body).toContain("location not available");
    expect(body).not.toContain("https://maps.google.com");
  });
});

describe("truthfulness contract (prepared ≠ sent ≠ delivered)", () => {
  it("describes the composer state without claiming delivery", () => {
    const text = describeState("composer-opened");
    expect(text.toLowerCase()).toContain("messaging app");
    expect(text.toLowerCase()).not.toContain("sent");
    expect(text.toLowerCase()).not.toContain("delivered");
  });

  it("mentions review-before-send in the notice and never claims sending", () => {
    expect(PRECONDITIONS_NOTICE.toLowerCase()).not.toContain("will send");
    expect(PRECONDITIONS_NOTICE.toLowerCase()).toContain("airtime");
  });
});

describe("device interactions", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    // jsdom's Location.href is non-configurable; replace the whole
    // window.location with a writable stand-in to observe navigations.
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it("initiateCall opens the dialer via tel: and reports composer-opened", () => {
    const state = initiateCall(CONTACT);
    expect(window.location.href).toBe("tel:+2348012345678");
    expect(state).toBe("composer-opened");
  });

  it("prepareEmergencySms opens an sms: URL with the encoded body", () => {
    const prepared = prepareEmergencySms({ contact: CONTACT, fix: FIX, uid: null });
    const href = window.location.href;
    expect(href.startsWith(`sms:${CONTACT.phoneNumber}`)).toBe(true);
    expect(href).toContain(encodeURIComponent("Emergency! I need assistance."));
    expect(prepared.state).toBe("composer-opened");
    expect(prepared.to).toBe(CONTACT.phoneNumber);
    expect(prepared.body).toContain("maps.google.com");
  });
});
