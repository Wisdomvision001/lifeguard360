import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render } from "@testing-library/react";

// ---- Leaflet mock ---------------------------------------------------------

/** Typed accessor for a Leaflet function replaced by vi.mock. */
function mockOf(fn: unknown): Mock {
  return fn as Mock;
}

const mapInstance = {
  remove: vi.fn(),
  setView: vi.fn(),
  fitBounds: vi.fn(),
  invalidateSize: vi.fn(),
  on: vi.fn(),
};

const markerInstance = {
  setLatLng: vi.fn(),
  remove: vi.fn(),
  bindTooltip: vi.fn().mockReturnThis(),
  bindPopup: vi.fn().mockReturnThis(),
  addTo: vi.fn().mockReturnThis(),
};

const circleInstance = {
  setLatLng: vi.fn(),
  setRadius: vi.fn(),
  remove: vi.fn(),
  addTo: vi.fn().mockReturnThis(),
};

const layerGroupInstance = {
  addTo: vi.fn().mockReturnThis(),
  clearLayers: vi.fn(),
};

vi.mock("leaflet", () => {
  // tileLayer returns a chainable "addTo" object; capture calls for assertions.
  const tileLayerInstance = { addTo: vi.fn().mockReturnThis() };
  const L = {
    map: vi.fn(() => mapInstance),
    tileLayer: vi.fn(() => tileLayerInstance),
    circleMarker: vi.fn(() => markerInstance),
    circle: vi.fn(() => circleInstance),
    layerGroup: vi.fn(() => layerGroupInstance),
  };
  return { default: L, ...L };
});

// Leaflet's CSS side-effect import: jsdom has no CSS handling and vitest is
// configured with css: false, so nothing to mock there.
vi.mock("leaflet/dist/leaflet.css", () => ({}));

import L from "leaflet";
import { LocationMap, toMapFacility, type MapFacility } from "@/components/LocationMap";
import type { NearbyFacility } from "@/services/facilities/nearbyDiscoveryContracts";
import type { FacilityWithDistance, LocationFix } from "@/types";

const FIX: LocationFix = {
  coordinates: { latitude: 9.2345, longitude: 12.4567 },
  accuracy: 35,
  timestamp: 1_700_000_000_000,
};

const UPDATED: LocationFix = {
  coordinates: { latitude: 6.5, longitude: 3.4 },
  accuracy: 120,
  timestamp: 1_700_000_100_000,
};

const FACILITY: FacilityWithDistance = {
  id: "fac-1",
  name: "Yola Specialist Hospital",
  category: "hospital",
  coordinates: { latitude: 9.21, longitude: 12.47 },
  phone: "+2348012345678",
  openingHours: "24/7",
  address: "Test Street, Yola, Adamawa State, Nigeria",
  verified: true,
  source: "Official registry (example.org), verified 2026-09-10",
  updatedAt: "2026-09-14T00:00:00Z",
  distanceMeters: 2750,
};

// Verified FacilitiesWithDistance are structurally assignable to the map's
// narrow MapFacility contract, so one helper covers both sources.
function renderMap(location: LocationFix | null, facilities?: MapFacility[]): void {
  render(<LocationMap location={location} facilities={facilities} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("LocationMap", () => {
  it("initializes the Leaflet map exactly once per container", () => {
    renderMap(null);
    expect(L.map).toHaveBeenCalledTimes(1);
    expect(L.tileLayer).toHaveBeenCalledTimes(1);
    expect(L.layerGroup).toHaveBeenCalledTimes(1);
  });

  it("with no location renders the container but never creates a marker", () => {
    renderMap(null);
    expect(L.circleMarker).not.toHaveBeenCalled();
    expect(L.circle).not.toHaveBeenCalled();
    expect(mapInstance.setView).not.toHaveBeenCalled();
  });

  it("with a valid fix places the marker at the fix coordinates", () => {
    renderMap(FIX);
    expect(L.circleMarker).toHaveBeenCalledTimes(1);
    const [latlng] = mockOf(L.circleMarker).mock.calls[0] ?? [];
    expect(latlng).toEqual([9.2345, 12.4567]);
    expect(mapInstance.setView).toHaveBeenCalledWith([9.2345, 12.4567], 15);
  });

  it("uses the supplied accuracy in metres for the accuracy circle", () => {
    renderMap(FIX);
    expect(L.circle).toHaveBeenCalledTimes(1);
    const [, options] = mockOf(L.circle).mock.calls[0] ?? [];
    expect(options).toMatchObject({ radius: 35 });
  });

  it("updates marker and circle in place when a new fix arrives", () => {
    const { rerender } = render(<LocationMap location={FIX} />);
    rerender(<LocationMap location={UPDATED} />);
    expect(L.circleMarker).toHaveBeenCalledTimes(1); // created once, not recreated
    expect(markerInstance.setLatLng).toHaveBeenCalledWith([6.5, 3.4]);
    expect(circleInstance.setRadius).toHaveBeenCalledWith(120);
    expect(mapInstance.setView).toHaveBeenLastCalledWith([6.5, 3.4], 15);
  });

  it("removes the previous marker/circle when location becomes null", () => {
    const { rerender } = render(<LocationMap location={FIX} />);
    rerender(<LocationMap location={null} />);
    expect(markerInstance.remove).toHaveBeenCalled();
    expect(circleInstance.remove).toHaveBeenCalled();
  });

  it("ignores invalid coordinates defensively without crashing", () => {
    const invalid: LocationFix = {
      coordinates: { latitude: 95, longitude: 200 },
      accuracy: 30,
      timestamp: 1_700_000_000_000,
    };
    expect(() => renderMap(invalid)).not.toThrow();
    expect(L.circleMarker).not.toHaveBeenCalled();
    expect(L.circle).not.toHaveBeenCalled();
  });

  it("cleans up the Leaflet map on unmount", () => {
    const { unmount } = render(<LocationMap location={FIX} />);
    unmount();
    expect(mapInstance.remove).toHaveBeenCalledTimes(1);
  });
});

describe("LocationMap facilities layer (Phase 5D-1)", () => {
  it("with no facilities creates the empty layer, plots no markers and keeps setView", () => {
    renderMap(FIX);
    expect(layerGroupInstance.clearLayers).toHaveBeenCalled();
    expect(mapInstance.fitBounds).not.toHaveBeenCalled();
    expect(mapInstance.setView).toHaveBeenCalledWith([9.2345, 12.4567], 15);
  });

  it("plots one marker per facility at its coordinates inside the layer", () => {
    const second: FacilityWithDistance = {
      ...FACILITY,
      id: "fac-2",
      name: "Clinic B",
      coordinates: { latitude: 9.25, longitude: 12.44 },
    };
    renderMap(FIX, [FACILITY, second]);
    // 1 user marker + 2 facility markers
    expect(L.circleMarker).toHaveBeenCalledTimes(3);
    const calls = mockOf(L.circleMarker).mock.calls;
    expect(calls[1]?.[0]).toEqual([9.21, 12.47]);
    expect(calls[2]?.[0]).toEqual([9.25, 12.44]);
  });

  it("binds a popup to every facility marker", () => {
    renderMap(FIX, [FACILITY]);
    // user marker binds a tooltip only; facility markers bind popup
    expect(markerInstance.bindPopup).toHaveBeenCalledTimes(1);
    const popupContent = markerInstance.bindPopup.mock.calls[0]?.[0] as HTMLElement;
    expect(popupContent.textContent).toContain("Yola Specialist Hospital");
    expect(popupContent.textContent).toContain("hospital");
    expect(popupContent.textContent).toContain("2.8 km away");
    expect(popupContent.textContent).toContain("Verified facility");
    expect(popupContent.textContent).toContain("24/7");
    const phoneLink = popupContent.querySelector('a[href="tel:+2348012345678"]');
    expect(phoneLink).not.toBeNull();
    const directions = popupContent.querySelector('a[target="_blank"]');
    expect(directions?.getAttribute("href")).toContain("9.21,12.47");
  });

  it("includes the address line in the popup when present", () => {
    renderMap(FIX, [FACILITY]);
    const popupContent = markerInstance.bindPopup.mock.calls[0]?.[0] as HTMLElement;
    expect(popupContent.textContent).toContain("Test Street, Yola, Adamawa State, Nigeria");
  });

  it("omits the address line when absent", () => {
    renderMap(FIX, [{ ...FACILITY, address: undefined }]);
    const popupContent = markerInstance.bindPopup.mock.calls[0]?.[0] as HTMLElement;
    expect(popupContent.textContent).not.toContain("Test Street");
  });
  it("shows the provenance source line in the popup (5D-3)", () => {
    renderMap(FIX, [FACILITY]);
    const popupContent = markerInstance.bindPopup.mock.calls[0]?.[0] as HTMLElement;
    expect(popupContent.textContent).toContain("Official registry (example.org), verified 2026-09-10");
  });

  it("omits the source line when provenance is absent/unknown", () => {
    renderMap(FIX, [{ ...FACILITY, source: "unknown" }]);
    const popupContent = markerInstance.bindPopup.mock.calls[0]?.[0] as HTMLElement;
    expect(popupContent.textContent).not.toContain("unknown");
  });

  it("fits the bounds over user + facilities instead of plain setView", () => {
    renderMap(FIX, [FACILITY]);
    expect(mapInstance.fitBounds).toHaveBeenCalledTimes(1);
    const [bounds] = mapInstance.fitBounds.mock.calls[0] ?? [];
    expect(bounds).toEqual([
      [9.21, 12.4567],
      [9.2345, 12.47],
    ]);
  });

  it("skips facilities with invalid coordinates without crashing", () => {
    const invalid: FacilityWithDistance = {
      ...FACILITY,
      id: "fac-bad",
      coordinates: { latitude: 120, longitude: 12.47 },
    };
    expect(() => renderMap(FIX, [FACILITY, invalid])).not.toThrow();
    // 1 user marker + only the 1 valid facility marker
    expect(L.circleMarker).toHaveBeenCalledTimes(2);
  });

  it("clears the facility layer when the results list becomes empty", () => {
    const { rerender } = render(<LocationMap location={FIX} facilities={[FACILITY]} />);
    rerender(<LocationMap location={FIX} facilities={[]} />);
    expect(layerGroupInstance.clearLayers).toHaveBeenCalledTimes(2);
  });
});

describe("LocationMap — dynamically discovered facilities", () => {
  /** A runtime-discovered (untrusted) record as the discovery service emits it. */
  function nearby(overrides: Partial<NearbyFacility> = {}): NearbyFacility {
    return {
      id: "dynamic-provider:node/42",
      name: "OSM Clinic",
      category: "clinic",
      coordinates: { latitude: 9.2, longitude: 12.4 },
      source: { id: "dynamic-provider", label: "OpenStreetMap" },
      trust: "dynamic",
      distanceMeters: 1234,
      address: "1 Test Road",
      phone: "+2348000000000",
      openingHours: "Mo-Su 08:00-20:00",
      sourceUrl: "https://www.openstreetmap.org/node/42",
      ...overrides,
    };
  }

  it("projects a discovered record onto the map contract without granting trust", () => {
    const projected = toMapFacility(nearby());
    expect(projected).toMatchObject({
      id: "dynamic-provider:node/42",
      name: "OSM Clinic",
      category: "clinic",
      verified: false,
      trust: "dynamic",
      source: "OpenStreetMap",
      distanceMeters: 1234,
      address: "1 Test Road",
      phone: "+2348000000000",
      openingHours: "Mo-Su 08:00-20:00",
      sourceUrl: "https://www.openstreetmap.org/node/42",
    });
  });

  it("projects a verified record as verified under its own provenance label", () => {
    const projected = toMapFacility(
      nearby({ source: { id: "lifeguard360", label: "Verified by Lifeguard360" }, trust: "verified" }),
    );
    expect(projected.verified).toBe(true);
    expect(projected.trust).toBe("verified");
    expect(projected.source).toBe("Verified by Lifeguard360");
  });

  it("never reads as verified from a provider-supplied flag — trust is the only signal", () => {
    const spoofed = { ...nearby(), verified: true } as NearbyFacility & { verified: boolean };
    expect(toMapFacility(spoofed).verified).toBe(false);
  });

  it("omits absent optional detail instead of inventing it", () => {
    const projected = toMapFacility(
      nearby({
        address: undefined,
        phone: undefined,
        openingHours: undefined,
        sourceUrl: undefined,
      }),
    );
    expect(projected.address).toBeUndefined();
    expect(projected.phone).toBeUndefined();
    expect(projected.openingHours).toBeUndefined();
    expect(projected.sourceUrl).toBeUndefined();
  });

  it("plots and popups a discovered facility as a dynamic result, never as verified", () => {
    renderMap(FIX, [toMapFacility(nearby())]);

    // 1 user marker + 1 facility marker at the provider's coordinates.
    expect(L.circleMarker).toHaveBeenCalledTimes(2);
    const popupContent = markerInstance.bindPopup.mock.calls[0]?.[0] as HTMLElement;
    expect(popupContent.textContent).toContain("OSM Clinic");
    expect(popupContent.textContent).toContain("Dynamic result · OpenStreetMap");
    expect(popupContent.textContent).not.toContain("Verified facility");
    expect(popupContent.textContent).not.toContain("Unverified record");
    // The provider is named once (in the trust line) — it is not repeated as a source line.
    expect((popupContent.textContent ?? "").split("OpenStreetMap")).toHaveLength(2);
    // The OSM element stays reachable from the popup.
    expect(
      popupContent.querySelector('a[href="https://www.openstreetmap.org/node/42"]'),
    ).not.toBeNull();
  });
});
