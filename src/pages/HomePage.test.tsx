import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { HomePage } from "@/pages/HomePage";
import type * as LocationServiceModule from "@/services/location/locationService";
import type * as DiscoveryModule from "@/services/facilities/nearbyDiscoveryService";
import type * as LocationMapModule from "@/components/LocationMap";
import type * as ReverseGeocodeModule from "@/services/location/reverseGeocodeService";
import { REVERSE_GEOCODE_ATTRIBUTION } from "@/services/location/reverseGeocodeService";
import { overpassProvider } from "@/services/facilities/overpassProvider";
import type { NearbyFacility } from "@/services/facilities/nearbyDiscoveryContracts";
import type { LocationFix } from "@/types";

/**
 * Home structure regression guard.
 *
 * jsdom cannot judge the 3-track visual layout, so these tests pin what jsdom
 * CAN hold accountable: every approved Home block is still rendered, every
 * existing Home image is still used, and the location preview keeps the
 * one-shot contract (a fix is acquired only from an explicit user action, and
 * honest copy is shown when the browser refuses).
 *
 * The facility preview is driven by the runtime discovery flow
 * (`discoverNearbyFacilities` + the Overpass provider), so that seam is
 * stubbed here and its inputs/outputs are inspected — the widening policy
 * itself is covered by nearbyDiscoveryService.test.ts.
 */

const { acquireMock, discoverMock, reverseMock } = vi.hoisted(() => ({
  acquireMock: vi.fn(),
  discoverMock: vi.fn(),
  reverseMock: vi.fn(),
}));

vi.mock("@/services/location/locationService", async (importOriginal) => {
  const actual = await importOriginal<typeof LocationServiceModule>();
  return { ...actual, acquireLocationFix: acquireMock };
});

vi.mock("@/services/facilities/nearbyDiscoveryService", async (importOriginal) => {
  const actual = await importOriginal<typeof DiscoveryModule>();
  return { ...actual, discoverNearbyFacilities: discoverMock };
});

// The readable-location lookup is the reverse-geocoding seam: stubbed so the
// suite never performs a real Nominatim request (the usage policy caps the
// public service, and tests must stay deterministic and offline).
vi.mock("@/services/location/reverseGeocodeService", async (importOriginal) => {
  const actual = await importOriginal<typeof ReverseGeocodeModule>();
  return { ...actual, reverseGeocode: reverseMock };
});

// Leaflet needs a real layout engine (see LocationMap.test.tsx, which mocks it
// for the same reason). Home's job is to hand the fix and the nearby
// facilities to the map, so the component is stubbed and its props are
// inspected — while the real `toMapFacility` projection is kept so the test
// exercises the actual display contract.
vi.mock("@/components/LocationMap", async (importOriginal) => {
  const actual = await importOriginal<typeof LocationMapModule>();
  return {
    ...actual,
    LocationMap: ({
      location,
      facilities,
    }: {
      location: LocationFix | null;
      facilities?: LocationMapModule.MapFacility[];
    }) => (
      <div
        role="application"
        aria-label="Map of your current location and nearby facilities"
        data-latitude={location?.coordinates.latitude ?? ""}
        data-facilities={facilities?.length ?? 0}
        data-sources={facilities?.map((facility) => facility.source).join("|") ?? ""}
      />
    ),
  };
});

const FIX: LocationFix = {
  coordinates: { latitude: 9.2398, longitude: 12.4987 },
  accuracy: 12,
  timestamp: Date.now(),
  source: "unknown",
};

function verifiedNearby(id: string, name: string, distanceMeters: number): NearbyFacility {
  return {
    id: `lifeguard360:${id}`,
    name,
    category: "Hospital",
    coordinates: { latitude: 9.24, longitude: 12.49 },
    source: { id: "lifeguard360", label: "Verified by Lifeguard360" },
    trust: "verified",
    distanceMeters,
  };
}

/** A runtime-discovered record exactly as the Overpass provider emits it. */
function discoveredNearby(id: string, name: string, distanceMeters: number): NearbyFacility {
  return {
    id: `dynamic-provider:${id}`,
    name,
    category: "Clinic",
    coordinates: { latitude: 9.241, longitude: 12.492 },
    source: { id: "dynamic-provider", label: "OpenStreetMap" },
    trust: "dynamic",
    distanceMeters,
    sourceUrl: `https://www.openstreetmap.org/${id}`,
  };
}

/** The real shape of a resolved Nominatim answer for the FIX coordinates. */
const READABLE_JIMETA = {
  place: {
    label: "Jimeta, Girei, Adamawa, 640221, Nigeria",
    coordinates: FIX.coordinates,
    attribution: REVERSE_GEOCODE_ATTRIBUTION,
  },
  reason: null,
};

function outcome(
  facilities: NearbyFacility[],
  overrides: Partial<DiscoveryModule.NearbyDiscoveryOutcome> = {},
): DiscoveryModule.NearbyDiscoveryOutcome {
  return {
    facilities,
    sources: [
      { id: "lifeguard360", label: "Verified by Lifeguard360" },
      { id: "dynamic-provider", label: "OpenStreetMap" },
    ],
    diagnostics: { countsBySource: {} },
    note: null,
    radiusMeters: 3_000,
    ...overrides,
  };
}

/** Four nearest-first results: the preview shows three, the fourth stays on /facilities. */
const RESULTS: NearbyFacility[] = [
  verifiedNearby("v1", "State Teaching Hospital", 1200),
  discoveredNearby("node/7", "OSM Community Clinic", 1900),
  verifiedNearby("v2", "St. Theresa Hospital", 5300),
  verifiedNearby("v3", "Yola Specialist Hospital", 6100),
];

const HOME_IMAGES = [
  "/images/lifeguard360-hero.jpg",
  "/images/emergency-response.jpg",
  "/images/burns.jpg",
  "/images/bleeding.jpg",
  "/images/choking.jpg",
  "/images/snake-bite.jpg",
  "/images/road-accident.jpg",
  "/images/fractures.jpg",
];

function renderHome(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe("HomePage — approved structure", () => {
  beforeEach(() => {
    acquireMock.mockReset();
    discoverMock.mockReset();
    reverseMock.mockReset();
    // Default: no readable location exists — the honest coordinate fallback.
    reverseMock.mockResolvedValue({ place: null, reason: "no-result" });
  });

  it("keeps every approved Home block and all six emergency situations", () => {
    renderHome();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /your safety companion in emergencies/i,
    );
    for (const block of [
      "Emergency Alert",
      "Emergency Situations",
      "Quick First Aid Tips",
      "Your Location",
      "Nearby Hospitals",
      "Emergency Contact",
    ]) {
      expect(screen.getByText(block)).toBeInTheDocument();
    }
    for (const label of [
      "Burns",
      "Bleeding",
      "Choking",
      "Snake Bite",
      "Road Accident",
      "Fractures",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    // Emergency escape hatch stays reachable from the hero and the alert card.
    expect(screen.getAllByRole("link", { name: /get help now/i }).length).toBeGreaterThanOrEqual(2);
  });

  it("reuses the existing real Home imagery — no reference assets, no placeholders", () => {
    renderHome();

    const sources = [...document.querySelectorAll("img")].map(
      (image) => image.getAttribute("src") ?? "",
    );
    for (const expected of HOME_IMAGES) {
      expect(
        sources.some((source) => source.endsWith(expected)),
        `${expected} should still be rendered on Home`,
      ).toBe(true);
    }
    expect(sources).toHaveLength(HOME_IMAGES.length);
  });

  it("requires no work until asked, then discovers from the user's own coordinates", () => {
    renderHome();

    // No fix exists yet, so nothing has been requested and no map is drawn.
    expect(acquireMock).not.toHaveBeenCalled();
    expect(discoverMock).not.toHaveBeenCalled();
    // No fix means no readable-location lookup either.
    expect(reverseMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
  });

  it("acquires location only from an explicit action, then previews the nearest facilities and the map", async () => {
    acquireMock.mockResolvedValue({ fix: FIX, error: null });
    discoverMock.mockResolvedValue(outcome(RESULTS));
    reverseMock.mockResolvedValue(READABLE_JIMETA);

    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Search facilities" }));

    await waitFor(() =>
      expect(screen.getByText("State Teaching Hospital")).toBeInTheDocument(),
    );
    expect(acquireMock).toHaveBeenCalledTimes(1);
    expect(discoverMock).toHaveBeenCalledTimes(1);
    // Discovery is driven by the user's own coordinates through the runtime provider.
    expect(discoverMock).toHaveBeenCalledWith(FIX.coordinates, overpassProvider);

    // Preview is capped at three facilities; the fourth lives on /facilities.
    expect(screen.queryByText("Yola Specialist Hospital")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /directions/i })).toHaveLength(3);

    // Every previewed row states its trust, and a discovered record never reads as verified.
    expect(screen.getAllByText("Verified")).toHaveLength(2);
    expect(screen.getByText("OSM")).toBeInTheDocument();
    expect(screen.getByText(/openstreetmap results/i)).toBeInTheDocument();

    // The readable location is primary, the coordinates + accuracy secondary.
    expect(await screen.findByText("Jimeta, Girei, Adamawa, 640221, Nigeria")).toBeInTheDocument();
    expect(screen.getByText(/9\.2398, 12\.4987 · ±12 m accuracy/)).toBeInTheDocument();
    // Attribution and the plain-language disclosure accompany the OSM label.
    expect(screen.getAllByText(/OpenStreetMap contributors/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/your coordinates are sent to openstreetmap/i),
    ).toBeInTheDocument();
    // One lookup for one fix — never a stream, never a repeat.
    expect(reverseMock).toHaveBeenCalledTimes(1);
    expect(reverseMock).toHaveBeenCalledWith(FIX.coordinates);

    const map = screen.getByRole("application");
    expect(map.getAttribute("data-latitude")).toBe(String(FIX.coordinates.latitude));
    // The map shows the wider nearby set (up to 10), not just the 3-row preview.
    expect(map.getAttribute("data-facilities")).toBe("4");
    expect(map.getAttribute("data-sources")).toContain("OpenStreetMap");
    // The alert card reports the acquired fix honestly instead of claiming GPS.
    expect(screen.getByText(/location acquired/i)).toBeInTheDocument();
  });

  it("shows honest copy and never searches when the browser refuses location", async () => {
    acquireMock.mockResolvedValue({ fix: null, error: "Location permission was denied." });

    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Find Nearby Hospitals" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/permission was denied/i);
    expect(discoverMock).not.toHaveBeenCalled();
    // A refused location is never reverse-geocoded: there is nothing to describe.
    expect(reverseMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
  });

  it("keeps the coordinates as the primary text when no readable location can be determined", async () => {
    acquireMock.mockResolvedValue({ fix: FIX, error: null });
    discoverMock.mockResolvedValue(outcome([]));
    reverseMock.mockResolvedValue({ place: null, reason: "no-result" });

    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Find Nearby Hospitals" }));

    // Coordinates remain exactly as before — the honest fallback, never a guess.
    expect(await screen.findByText("9.2398, 12.4987")).toBeInTheDocument();
    expect(screen.getByText(/9\.2398, 12\.4987 · ±12 m accuracy/)).toBeInTheDocument();
    // The failure is reported as a description problem, not an acquisition one.
    expect(await screen.findByText(/readable location name could not be determined/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /readable location name could not be determined/i,
    );
    // No fabricated label, and no OSM attribution for a label that does not exist.
    expect(screen.queryByText(/your coordinates are sent to openstreetmap/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/openstreetmap contributors/i)).not.toBeInTheDocument();
  });

  it("shows honest feedback while the readable location is still being looked up", async () => {
    acquireMock.mockResolvedValue({ fix: FIX, error: null });
    discoverMock.mockResolvedValue(outcome([]));
    reverseMock.mockReturnValue(new Promise(() => undefined));

    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Find Nearby Hospitals" }));

    expect(
      await screen.findByText(/Finding a readable location name/i),
    ).toBeInTheDocument();
    // Location acquisition itself already succeeded, so the alert card says so.
    expect(screen.getByText(/location acquired/i)).toBeInTheDocument();
  });

  it("reports widening honestly instead of presenting a wide result set as local", async () => {
    acquireMock.mockResolvedValue({ fix: FIX, error: null });
    discoverMock.mockResolvedValue(
      outcome([], {
        note: "No facilities were found even after widening the search to 50 km.",
        radiusMeters: 50_000,
      }),
    );

    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Search facilities" }));

    expect(
      await screen.findByText(/even after widening the search to 50 km/i),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("link", { name: /directions/i })).toHaveLength(0);
    // No fabricated rows, no attribution for results that do not exist.
    expect(screen.queryByText(/openstreetmap results/i)).not.toBeInTheDocument();
    // The button returns to its resting state rather than staying stuck.
    expect(screen.getByRole("button", { name: "Search facilities" })).toBeEnabled();
  });
});
