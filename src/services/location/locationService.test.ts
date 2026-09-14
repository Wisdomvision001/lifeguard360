import { describe, expect, it, vi } from "vitest";

import {
  acquireLocationFix,
  classifyAccuracy,
  describeInvalidFix,
  FRESHNESS_WINDOW_MS,
  isValidFixInput,
  isFresh,
} from "@/services/location/locationService";
import type { LocationFix } from "@/types";

/** Build a Geolocation stub whose getCurrentPosition invokes the captured callbacks. */
function stubGeolocation(
  impl: (
    success: (position: GeolocationPosition) => void,
    failure: (error: GeolocationPositionError) => void,
  ) => void,
): Geolocation {
  return {
    getCurrentPosition: vi.fn((success, failure) => impl(success, failure)),
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
  } as unknown as Geolocation;
}

const VALID_POSITION: GeolocationPosition = {
  coords: {
    latitude: 6.5244,
    longitude: 3.3792,
    accuracy: 25,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: 1_700_000_000_000,
  toJSON: () => ({}),
} as unknown as GeolocationPosition;

const BASE_FIX: LocationFix = {
  coordinates: { latitude: 6.5244, longitude: 3.3792 },
  accuracy: 25,
  timestamp: 1_700_000_000_000,
};

describe("isValidFixInput", () => {
  it("accepts a valid payload", () => {
    expect(
      isValidFixInput({ latitude: 6.5244, longitude: 3.3792, accuracy: 25, timestamp: 1_700_000_000_000 }),
    ).toBe(true);
  });

  it("accepts boundary coordinates", () => {
    expect(isValidFixInput({ latitude: 90, longitude: 180, accuracy: 0, timestamp: 1 })).toBe(true);
    expect(isValidFixInput({ latitude: -90, longitude: -180, accuracy: 0, timestamp: 1 })).toBe(true);
  });

  it.each([91, -91, NaN, Infinity])("rejects invalid latitude %s", (latitude) => {
    expect(isValidFixInput({ latitude, longitude: 0, accuracy: 10, timestamp: 1_000 })).toBe(false);
  });

  it.each([181, -181, NaN, Infinity])("rejects invalid longitude %s", (longitude) => {
    expect(isValidFixInput({ latitude: 0, longitude, accuracy: 10, timestamp: 1_000 })).toBe(false);
  });

  it.each([NaN, Infinity, -1])("rejects invalid accuracy %s", (accuracy) => {
    expect(isValidFixInput({ latitude: 0, longitude: 0, accuracy, timestamp: 1_000 })).toBe(false);
  });

  it.each([NaN, Infinity, 0, -5])("rejects invalid timestamp %s", (timestamp) => {
    expect(isValidFixInput({ latitude: 0, longitude: 0, accuracy: 10, timestamp })).toBe(false);
  });
});

describe("classifyAccuracy", () => {
  it.each([
    [19.9, "excellent"],
    [20, "good"],
    [50, "acceptable"],
    [100, "poor"],
    [500, "critical"],
    [501, "critical"],
    [5000, "critical"],
  ] as const)("classifies %s m as %s", (accuracy, expected) => {
    expect(classifyAccuracy(accuracy)).toBe(expected);
  });
});

describe("acquireLocationFix", () => {
  it("maps a valid browser position to a classified LocationFix", async () => {
    const outcome = await acquireLocationFix(undefined, stubGeolocation((success) => success(VALID_POSITION)));
    expect(outcome.error).toBeNull();
    expect(outcome.fix).not.toBeNull();
    expect(outcome.fix?.coordinates).toEqual({ latitude: 6.5244, longitude: 3.3792 });
    expect(outcome.fix?.accuracy).toBe(25);
    expect(outcome.fix?.timestamp).toBe(1_700_000_000_000);
    expect(outcome.fix?.quality).toBe("good");
    expect(outcome.fix?.source).toBe("unknown");
  });

  it.each([
    ["latitude out of range", { ...VALID_POSITION, coords: { ...VALID_POSITION.coords, latitude: 91 } }],
    ["longitude out of range", { ...VALID_POSITION, coords: { ...VALID_POSITION.coords, longitude: -181 } }],
    ["NaN accuracy", { ...VALID_POSITION, coords: { ...VALID_POSITION.coords, accuracy: NaN } }],
    ["negative accuracy", { ...VALID_POSITION, coords: { ...VALID_POSITION.coords, accuracy: -3 } }],
    ["zero timestamp", { ...VALID_POSITION, timestamp: 0 }],
  ] as const)("rejects %s gracefully with a structured error", async (_label, position) => {
    const outcome = await acquireLocationFix(undefined, stubGeolocation((success) => success(position)));
    expect(outcome.fix).toBeNull();
    expect(outcome.error).toBe(describeInvalidFix());
  });

  it("maps PERMISSION_DENIED to the denied message", async () => {
    const outcome = await acquireLocationFix(
      undefined,
      stubGeolocation((_s, failure) => failure({ code: 1, message: "denied" } as GeolocationPositionError)),
    );
    expect(outcome.fix).toBeNull();
    expect(outcome.error).toBe("Location permission was denied.");
  });

  it("maps POSITION_UNAVAILABLE to the unavailable message", async () => {
    const outcome = await acquireLocationFix(
      undefined,
      stubGeolocation((_s, failure) => failure({ code: 2, message: "unavailable" } as GeolocationPositionError)),
    );
    expect(outcome.fix).toBeNull();
    expect(outcome.error).toBe("Your position could not be determined.");
  });

  it("maps TIMEOUT to the timeout message", async () => {
    const outcome = await acquireLocationFix(
      undefined,
      stubGeolocation((_s, failure) => failure({ code: 3, message: "timeout" } as GeolocationPositionError)),
    );
    expect(outcome.fix).toBeNull();
    expect(outcome.error).toBe("Location request timed out.");
  });

  it("resolves an honest unsupported outcome when geolocation is absent", async () => {
    const outcome = await acquireLocationFix(undefined, null);
    expect(outcome.fix).toBeNull();
    expect(outcome.error).toContain("does not support location");
  });

  it("passes the default options (high accuracy, 15 s timeout, 30 s maximumAge) to the browser", async () => {
    const geo = stubGeolocation((success) => success(VALID_POSITION));
    await acquireLocationFix(undefined, geo);
    const options = (geo.getCurrentPosition as ReturnType<typeof vi.fn>).mock.calls[0]?.[2];
    expect(options).toEqual({ enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });
});

describe("isFresh", () => {
  it("treats a recent fix as fresh", () => {
    expect(isFresh(BASE_FIX, BASE_FIX.timestamp + 1_000)).toBe(true);
  });

  it("treats a fix beyond the window as stale", () => {
    expect(isFresh(BASE_FIX, BASE_FIX.timestamp + FRESHNESS_WINDOW_MS + 1)).toBe(false);
  });

  it("holds at the exact boundary", () => {
    expect(isFresh(BASE_FIX, BASE_FIX.timestamp + FRESHNESS_WINDOW_MS)).toBe(true);
  });
});
