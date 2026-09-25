import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildEmergencySmsBody,
  describeState,
  initiateCall,
  prepareEmergencySms,
  PRECONDITIONS_NOTICE,
} from "@/services/communication/communicationService";
import type { LocationFix } from "@/types";

// Activity logging is mocked so the emergency_action / location_shared records
// can be asserted without touching Firestore or device storage.
const logActivityMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/activity/activityService", () => ({ logActivity: logActivityMock }));

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

  it("logs the emergency_action for a not-signed-in user (uid: null)", () => {
    logActivityMock.mockClear();

    prepareEmergencySms({ contact: CONTACT, fix: null, uid: null });

    expect(logActivityMock).toHaveBeenCalledWith(null, "emergency_action", {
      action: "sms_prepared",
      contactId: CONTACT.id,
      includedLocation: false,
    });
  });

  it("logs the emergency_action for an authenticated user with the same payload", () => {
    logActivityMock.mockClear();

    prepareEmergencySms({ contact: CONTACT, fix: null, uid: "user-1" });

    expect(logActivityMock).toHaveBeenCalledWith("user-1", "emergency_action", {
      action: "sms_prepared",
      contactId: CONTACT.id,
      includedLocation: false,
    });
  });

  it("keeps the existing location_shared record when a fix is supplied", () => {
    logActivityMock.mockClear();

    prepareEmergencySms({ contact: CONTACT, fix: FIX, uid: null });

    expect(logActivityMock).toHaveBeenCalledWith(null, "emergency_action", {
      action: "sms_prepared",
      contactId: CONTACT.id,
      includedLocation: true,
    });
    // The record proves a fix was included; the coordinates themselves are
    // never stored (Task 1 data minimisation).
    expect(logActivityMock).toHaveBeenCalledWith(null, "location_shared", {
      via: "sms",
      contactId: CONTACT.id,
    });
  });

  it.each([null, "user-1"])(
    "never stores raw coordinates in the location_shared record (uid: %s)",
    (uid) => {
      logActivityMock.mockClear();

      prepareEmergencySms({ contact: CONTACT, fix: FIX, uid });

      const [, , detail] = logActivityMock.mock.calls.find(
        (call) => call[1] === "location_shared",
      ) as [unknown, string, Record<string, unknown>];
      expect(detail).toEqual({ via: "sms", contactId: CONTACT.id });
      expect("coordinates" in detail).toBe(false);
    },
  );

  it("does not log location_shared when no fix is supplied", () => {
    logActivityMock.mockClear();

    prepareEmergencySms({ contact: CONTACT, fix: null, uid: "user-1" });

    expect(logActivityMock).not.toHaveBeenCalledWith(
      "user-1",
      "location_shared",
      expect.anything(),
    );
  });
});
