import { describe, expect, it } from "vitest";

import {
  formatDistance,
  formatTimestamp,
  distanceMeters,
  mapsLink,
  describeAccuracy,
  formatCoordinates,
  formatCoordinateMeta,
} from "@/utils/format";

describe("formatDistance", () => {
  it("formats metres below 1 km", () => {
    expect(formatDistance(450)).toBe("450 m away");
  });

  it("formats kilometres above 1 km", () => {
    expect(formatDistance(2400)).toBe("2.4 km away");
  });

  it("handles missing and invalid input honestly", () => {
    expect(formatDistance(null)).toBe("—");
    expect(formatDistance(undefined)).toBe("—");
    expect(formatDistance(Number.NaN)).toBe("—");
  });
});

describe("formatTimestamp", () => {
  it("formats a valid date", () => {
    const out = formatTimestamp("2026-01-15T10:30:00Z");
    expect(out).not.toBe("—");
    expect(out.length).toBeGreaterThan(0);
  });

  it("returns an em dash for invalid input", () => {
    expect(formatTimestamp("not-a-date")).toBe("—");
  });
});

describe("distanceMeters", () => {
  it("is zero for identical points", () => {
    const point = { latitude: 6.5244, longitude: 3.3792 };
    expect(distanceMeters(point, point)).toBe(0);
  });

  it("is roughly right for a known pair (Lagos Ikeja <-> VI ~ 20 km)", () => {
    const ikeja = { latitude: 6.6018, longitude: 3.3515 };
    const victoriaIsland = { latitude: 6.4281, longitude: 3.4219 };
    const d = distanceMeters(ikeja, victoriaIsland);
    expect(d).toBeGreaterThan(15000);
    expect(d).toBeLessThan(25000);
  });
});

describe("mapsLink", () => {
  it("builds a Google Maps URL with 6-decimal coordinates", () => {
    const link = mapsLink({ latitude: 6.5244, longitude: 3.3792 });
    expect(link).toBe("https://maps.google.com/?q=6.524400,3.379200");
  });
});

describe("describeAccuracy", () => {
  it("bands accuracy honestly", () => {
    expect(describeAccuracy(10)).toBe("high accuracy");
    expect(describeAccuracy(80)).toBe("moderate accuracy");
    expect(describeAccuracy(500)).toBe("low accuracy");
    expect(describeAccuracy(Number.NaN)).toBe("unknown accuracy");
  });
});

describe("formatCoordinates", () => {
  it("formats a coordinate with 4 decimals by default", () => {
    expect(formatCoordinates({ latitude: 9.2398, longitude: 12.4987 })).toBe("9.2398, 12.4987");
  });

  it("honours an explicit precision", () => {
    expect(formatCoordinates({ latitude: 9.2398, longitude: 12.4987 }, 5)).toBe("9.23980, 12.49870");
  });

  it("never prints a broken coordinate as if it were real", () => {
    expect(formatCoordinates({ latitude: Number.NaN, longitude: 12.4987 })).toBe("—");
    expect(formatCoordinates({ latitude: 9.2398, longitude: Number.POSITIVE_INFINITY })).toBe("—");
  });
});

describe("formatCoordinateMeta", () => {
  it("renders the approved secondary line", () => {
    expect(
      formatCoordinateMeta({
        coordinates: { latitude: 9.2398, longitude: 12.4987 },
        accuracy: 18,
      }),
    ).toBe("9.2398, 12.4987 · ±18 m accuracy");
  });

  it("rounds the accuracy radius the way the device reports it", () => {
    expect(
      formatCoordinateMeta({
        coordinates: { latitude: 9.2398, longitude: 12.4987 },
        accuracy: 17.6,
      }),
    ).toBe("9.2398, 12.4987 · ±18 m accuracy");
  });

  it("states unknown accuracy instead of guessing one", () => {
    expect(
      formatCoordinateMeta({
        coordinates: { latitude: 9.2398, longitude: 12.4987 },
        accuracy: Number.NaN,
      }),
    ).toBe("9.2398, 12.4987 · accuracy unknown");
  });
});
