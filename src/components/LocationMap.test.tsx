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
  invalidateSize: vi.fn(),
  on: vi.fn(),
};

const markerInstance = {
  setLatLng: vi.fn(),
  remove: vi.fn(),
  bindTooltip: vi.fn().mockReturnThis(),
  addTo: vi.fn().mockReturnThis(),
};

const circleInstance = {
  setLatLng: vi.fn(),
  setRadius: vi.fn(),
  remove: vi.fn(),
  addTo: vi.fn().mockReturnThis(),
};

vi.mock("leaflet", () => {
  // tileLayer returns a chainable "addTo" object; capture calls for assertions.
  const tileLayerInstance = { addTo: vi.fn().mockReturnThis() };
  const L = {
    map: vi.fn(() => mapInstance),
    tileLayer: vi.fn(() => tileLayerInstance),
    circleMarker: vi.fn(() => markerInstance),
    circle: vi.fn(() => circleInstance),
  };
  return { default: L, ...L };
});

// Leaflet's CSS side-effect import: jsdom has no CSS handling and vitest is
// configured with css: false, so nothing to mock there.
vi.mock("leaflet/dist/leaflet.css", () => ({}));

import L from "leaflet";
import { LocationMap } from "@/components/LocationMap";
import type { LocationFix } from "@/types";

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

function renderMap(location: LocationFix | null): void {
  render(<LocationMap location={location} />);
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
