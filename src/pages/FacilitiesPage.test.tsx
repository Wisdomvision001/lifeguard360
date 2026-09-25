import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { FacilitiesPage } from "@/pages/FacilitiesPage";
import type * as DiscoveryModule from "@/services/facilities/nearbyDiscoveryService";
import type * as LocationMapModule from "@/components/LocationMap";
import type * as GeolocationModule from "@/hooks/useGeolocation";
import { overpassProvider } from "@/services/facilities/overpassProvider";
import type { NearbyFacility } from "@/services/facilities/nearbyDiscoveryContracts";
import type { LocationFix } from "@/types";

/**
 * Find Nearby Healthcare Facilities — location-driven discovery guard.
 *
 * The approved behaviour is: the user's current coordinates are the only input,
 * the discovery flow widens itself internally, and distances are information
 * rather than an eligibility filter. These tests therefore pin that NO radius
 * control exists anywhere on the page, that the search is driven by the acquired
 * fix through the runtime provider, and that empty/failure states stay honest.
 */

const { geo, discoverMock } = vi.hoisted(() => ({
  geo: {
    status: "idle" as GeolocationModule.GeoRequestStatus,
    fix: null as LocationFix | null,
    message: null as string | null,
    requestFix: vi.fn(),
    reset: vi.fn(),
  },
  discoverMock: vi.fn(),
}));

vi.mock("@/hooks/useGeolocation", () => ({ useGeolocation: () => geo }));

vi.mock("@/services/facilities/nearbyDiscoveryService", async (importOriginal) => {
  const actual = await importOriginal<typeof DiscoveryModule>();
  return { ...actual, discoverNearbyFacilities: discoverMock };
});

// Leaflet needs a real layout engine; the page's job is to hand the fix and the
// discovered facilities to the map, so the component is stubbed while the real
// `toMapFacility` projection is kept.
vi.mock("@/components/LocationMap", async (importOriginal) => {
  const actual = await importOriginal<typeof LocationMapModule>();
  return {
    ...actual,
    LocationMap: ({
      facilities,
    }: {
      facilities?: LocationMapModule.MapFacility[];
    }) => (
      <div
        role="application"
        aria-label="Map of your current location and nearby facilities"
        data-facilities={facilities?.length ?? 0}
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
    phone: "+2348012345678",
  };
}

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

const RESULTS: NearbyFacility[] = [
  verifiedNearby("v1", "State Teaching Hospital", 1200),
  discoveredNearby("node/7", "OSM Community Clinic", 1900),
  verifiedNearby("v2", "St. Theresa Hospital", 5300),
];

/**
 * The mocked hook grants the fix the way the real one does: the fix becomes
 * available on the returned object, so the page re-renders with it.
 */
function grantFix(): void {
  geo.requestFix.mockImplementation(async () => {
    geo.fix = FIX;
    return FIX;
  });
}

beforeEach(() => {
  discoverMock.mockReset();
  geo.status = "idle";
  geo.fix = null;
  geo.message = null;
  geo.requestFix.mockReset();
  geo.reset.mockReset();
});

describe("FacilitiesPage — no radius control", () => {
  it("renders no radius selector of any kind and exactly one search control", () => {
    const { container } = render(<FacilitiesPage />);

    // The whole page: no dropdown, slider, radio group or numeric radius input.
    expect(document.querySelectorAll("select")).toHaveLength(0);
    expect(document.querySelectorAll("input")).toHaveLength(0);
    expect(document.querySelectorAll('[role="combobox"], [role="slider"], [role="radiogroup"]')).toHaveLength(0);

    // The single control is the submit button — nothing to tune before searching.
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(form?.querySelectorAll("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /find facilities near me/i })).toBeInTheDocument();
    expect(screen.queryByText(/search radius|radius:/i)).not.toBeInTheDocument();
  });

  it("keeps the radius out of the search even after results are shown", async () => {
    grantFix();
    discoverMock.mockResolvedValue(outcome(RESULTS));

    render(<FacilitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: /find facilities near me/i }));

    await waitFor(() => expect(screen.getByText("State Teaching Hospital")).toBeInTheDocument());

    expect(document.querySelectorAll("select, input, [role=\"slider\"], [role=\"radiogroup\"]")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /search again/i })).toBeInTheDocument();
  });
});

describe("FacilitiesPage — location-driven discovery", () => {
  it("searches once from the acquired fix through the runtime provider, nearest-first", async () => {
    grantFix();
    discoverMock.mockResolvedValue(outcome(RESULTS));

    render(<FacilitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: /find facilities near me/i }));

    await waitFor(() => expect(screen.getByText("State Teaching Hospital")).toBeInTheDocument());

    expect(geo.requestFix).toHaveBeenCalledTimes(1);
    expect(discoverMock).toHaveBeenCalledTimes(1);
    // Coordinates in, provider in — no radius is chosen by the UI.
    expect(discoverMock).toHaveBeenCalledWith(FIX.coordinates, overpassProvider);

    // Results are listed in the order the flow returned them (nearest-first).
    const results = screen.getByRole("region", { name: /nearby facilities/i });
    const names = within(results)
      .getAllByRole("heading", { level: 3 })
      .map((node) => node.textContent ?? "");
    expect(names).toHaveLength(3);
    expect(names[0]).toContain("State Teaching Hospital");
    expect(names[1]).toContain("OSM Community Clinic");
    expect(names[2]).toContain("St. Theresa Hospital");

    // Each source is labelled, and a discovered record never reads as verified.
    expect(screen.getByText("Lifeguard360 verified")).toBeInTheDocument();
    expect(screen.getByText("OpenStreetMap discovered")).toBeInTheDocument();
    expect(screen.getAllByText("Verified")).toHaveLength(2);
    expect(screen.getAllByText("OSM")).toHaveLength(1);
    expect(screen.getByText(/© OpenStreetMap contributors \(ODbL\)/)).toBeInTheDocument();

    // A discovered record stays traceable to its source record.
    const sourceRecord = screen.getByRole("link", { name: /source record/i });
    expect(sourceRecord).toHaveAttribute("href", "https://www.openstreetmap.org/node/7");

    // Distances are shown as information (never used to hide a result).
    expect(screen.getByText(/1\.2 km away/)).toBeInTheDocument();
    expect(screen.getByText(/1\.9 km away/)).toBeInTheDocument();
    const directions = screen.getAllByRole("link", { name: /directions/i });
    expect(directions).toHaveLength(3);
    expect(directions[0]).toHaveAttribute(
      "href",
      expect.stringContaining("destination=9.24,12.49"),
    );

    // The map receives the same discovered set.
    expect(screen.getByRole("application")).toHaveAttribute("data-facilities", "3");
  });

  it("reuses an existing fix instead of requesting a second one", async () => {
    geo.fix = FIX;
    discoverMock.mockResolvedValue(outcome(RESULTS));

    render(<FacilitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: /search again/i }));

    await waitFor(() => expect(screen.getByText("State Teaching Hospital")).toBeInTheDocument());
    expect(geo.requestFix).not.toHaveBeenCalled();
    expect(discoverMock).toHaveBeenCalledWith(FIX.coordinates, overpassProvider);
  });
});

describe("FacilitiesPage — honest states", () => {
  it("reports the widest rung's empty result instead of fabricating a list", async () => {
    grantFix();
    discoverMock.mockResolvedValue(
      outcome([], {
        note: "No facilities were found even after widening the search to 50 km.",
        radiusMeters: 50_000,
      }),
    );

    const { container } = render(<FacilitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: /find facilities near me/i }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/even after widening the search to 50 km/i),
    );
    expect(screen.getByText(/no facilities found nearby/i)).toBeInTheDocument();
    // No rows, no directions, no source chips for results that do not exist.
    expect(container.querySelectorAll("li")).toHaveLength(0);
    expect(screen.queryAllByRole("link", { name: /directions/i })).toHaveLength(0);
    expect(screen.queryByText("OpenStreetMap discovered")).not.toBeInTheDocument();
  });

  it("surfaces a provider failure as an honest error and never a fabricated list", async () => {
    const { NearbyDiscoveryError } = await import("@/services/facilities/nearbyDiscoveryContracts");
    grantFix();
    discoverMock.mockRejectedValue(
      new NearbyDiscoveryError("provider-timeout", "Facility data is currently unavailable."),
    );

    const { container } = render(<FacilitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: /find facilities near me/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/currently unavailable/i);
    expect(container.querySelectorAll("li")).toHaveLength(0);
    expect(screen.queryByText("Lifeguard360 verified")).not.toBeInTheDocument();
  });

  it("stops before any provider call and shows the reason when location is refused", async () => {
    geo.message =
      "Location permission was denied. Enable it in your browser settings to share your location.";
    geo.requestFix.mockResolvedValue(null);

    render(<FacilitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: /find facilities near me/i }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((node) => /permission was denied/i.test(node.textContent ?? ""))).toBe(true);
    expect(discoverMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
  });
});
