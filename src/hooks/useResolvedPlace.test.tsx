import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { useResolvedPlace, type PlaceResolver } from "@/hooks/useResolvedPlace";
import {
  REVERSE_GEOCODE_ATTRIBUTION,
  type ResolvedPlace,
  type ReverseGeocodeOutcome,
} from "@/services/location/reverseGeocodeService";
import type { GeoCoordinates, LocationFix } from "@/types";

/**
 * useResolvedPlace — the passive readable-location hook (Task 1).
 *
 * The hook is exercised through a tiny probe component so every state it
 * publishes (label/status/attribution/reason) can be inspected directly, and
 * so prop changes model what actually happens on the pages: the one-shot fix
 * arrives, and nothing else is requested.
 */

const FIX_A: LocationFix = {
  coordinates: { latitude: 9.2398, longitude: 12.4987 },
  accuracy: 12,
  timestamp: 1_700_000_000_000,
};

const FIX_B: LocationFix = {
  coordinates: { latitude: 6.5244, longitude: 3.3792 },
  accuracy: 30,
  timestamp: 1_700_000_000_000,
};

function place(label: string, coordinates: GeoCoordinates = FIX_A.coordinates): ResolvedPlace {
  return { label, coordinates, attribution: REVERSE_GEOCODE_ATTRIBUTION };
}

function Probe({ fix, resolve }: { fix: LocationFix | null; resolve: PlaceResolver }) {
  const state = useResolvedPlace(fix, resolve);
  return (
    <div
      data-testid="probe"
      data-status={state.status}
      data-label={state.label ?? ""}
      data-attribution={state.attribution ?? ""}
      data-reason={state.reason ?? ""}
    />
  );
}

function probe(): HTMLElement {
  return screen.getByTestId("probe");
}

async function flushMicrotasks(times = 6): Promise<void> {
  for (let index = 0; index < times; index++) await Promise.resolve();
}

describe("useResolvedPlace", () => {
  it("resolves a readable label for an existing fix", async () => {
    const resolve = vi.fn((_coordinates: GeoCoordinates) =>
      Promise.resolve<ReverseGeocodeOutcome>({
        place: place("Jimeta, Girei, Adamawa, 640221, Nigeria"),
        reason: null,
      }),
    );

    render(<Probe fix={FIX_A} resolve={resolve} />);

    // The resolving state is published rather than hidden.
    expect(probe().getAttribute("data-status")).toBe("resolving");

    await waitFor(() => expect(probe().getAttribute("data-status")).toBe("resolved"));
    expect(probe().getAttribute("data-label")).toBe("Jimeta, Girei, Adamawa, 640221, Nigeria");
    expect(probe().getAttribute("data-attribution")).toBe(REVERSE_GEOCODE_ATTRIBUTION);
    expect(probe().getAttribute("data-reason")).toBe("");
    expect(resolve).toHaveBeenCalledTimes(1);
    // Only the coordinate is handed over — no account or identity data exists here.
    expect(resolve.mock.calls[0][0]).toEqual(FIX_A.coordinates);
  });

  it("does no work at all without a fix, and never touches the Geolocation API", async () => {
    const getCurrentPosition = vi.fn();
    const watchPosition = vi.fn();
    vi.stubGlobal("navigator", {
      geolocation: { getCurrentPosition, watchPosition, clearWatch: vi.fn() },
    });
    const resolve = vi.fn();

    render(<Probe fix={null} resolve={resolve} />);

    expect(probe().getAttribute("data-status")).toBe("idle");
    expect(probe().getAttribute("data-label")).toBe("");
    expect(resolve).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(watchPosition).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("performs exactly one lookup per fix, however many times it re-renders", async () => {
    const resolve = vi.fn(() => Promise.resolve<ReverseGeocodeOutcome>({ place: place("Jimeta"), reason: null }));

    const { rerender } = render(<Probe fix={FIX_A} resolve={resolve} />);
    await waitFor(() => expect(probe().getAttribute("data-status")).toBe("resolved"));

    rerender(<Probe fix={{ ...FIX_A }} resolve={resolve} />);
    rerender(<Probe fix={{ ...FIX_A }} resolve={resolve} />);
    await flushMicrotasks();

    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("looks up a genuinely new fix", async () => {
    const resolve = vi.fn((coordinates: GeoCoordinates) =>
      Promise.resolve<ReverseGeocodeOutcome>({
        place: place(coordinates.latitude === 6.5244 ? "Lagos, Nigeria" : "Jimeta, Nigeria", coordinates),
        reason: null,
      }),
    );

    const { rerender } = render(<Probe fix={FIX_A} resolve={resolve} />);
    await waitFor(() => expect(probe().getAttribute("data-label")).toBe("Jimeta, Nigeria"));

    rerender(<Probe fix={FIX_B} resolve={resolve} />);

    await waitFor(() => expect(probe().getAttribute("data-label")).toBe("Lagos, Nigeria"));
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("reports an honest failure instead of inventing a place name", async () => {
    const resolve = vi.fn(() =>
      Promise.resolve<ReverseGeocodeOutcome>({ place: null, reason: "rate-limited" }),
    );

    render(<Probe fix={FIX_A} resolve={resolve} />);

    await waitFor(() => expect(probe().getAttribute("data-status")).toBe("unavailable"));
    expect(probe().getAttribute("data-label")).toBe("");
    expect(probe().getAttribute("data-attribution")).toBe("");
    expect(probe().getAttribute("data-reason")).toBe("rate-limited");
  });

  it("returns to idle when the fix is cleared, and reuses the answer for the same coordinates", async () => {
    const resolve = vi.fn(() =>
      Promise.resolve<ReverseGeocodeOutcome>({ place: place("Jimeta"), reason: null }),
    );

    const { rerender } = render(<Probe fix={FIX_A} resolve={resolve} />);
    await waitFor(() => expect(probe().getAttribute("data-status")).toBe("resolved"));

    rerender(<Probe fix={null} resolve={resolve} />);
    expect(probe().getAttribute("data-status")).toBe("idle");
    expect(probe().getAttribute("data-label")).toBe("");

    // The very same coordinates are already described — no second request.
    rerender(<Probe fix={FIX_A} resolve={resolve} />);
    expect(probe().getAttribute("data-status")).toBe("resolved");
    expect(probe().getAttribute("data-label")).toBe("Jimeta");
    await flushMicrotasks();
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("looks the same coordinates up again once a different fix superseded them", async () => {
    const resolve = vi.fn((coordinates: GeoCoordinates) =>
      Promise.resolve<ReverseGeocodeOutcome>(
        coordinates.latitude === FIX_A.coordinates.latitude
          ? { place: place("Jimeta", coordinates), reason: null }
          : { place: place("Lagos, Nigeria", coordinates), reason: null },
      ),
    );

    const { rerender } = render(<Probe fix={FIX_A} resolve={resolve} />);
    await waitFor(() => expect(probe().getAttribute("data-label")).toBe("Jimeta"));

    rerender(<Probe fix={FIX_B} resolve={resolve} />);
    await waitFor(() => expect(probe().getAttribute("data-label")).toBe("Lagos, Nigeria"));

    // Coming back to the original coordinates is a new fix, so it is described again.
    rerender(<Probe fix={{ ...FIX_A }} resolve={resolve} />);
    await waitFor(() => expect(probe().getAttribute("data-label")).toBe("Jimeta"));
    expect(resolve).toHaveBeenCalledTimes(3);
  });

  it("never lets a superseded lookup overwrite the newer fix's label", async () => {
    let settleFirst: (outcome: ReverseGeocodeOutcome) => void = () => undefined;
    const resolve = vi.fn((coordinates: GeoCoordinates) => {
      if (coordinates.latitude === FIX_A.coordinates.latitude) {
        return new Promise<ReverseGeocodeOutcome>((resolvePromise) => {
          settleFirst = resolvePromise;
        });
      }
      return Promise.resolve<ReverseGeocodeOutcome>({
        place: place("Lagos, Nigeria", coordinates),
        reason: null,
      });
    });

    const { rerender } = render(<Probe fix={FIX_A} resolve={resolve} />);
    rerender(<Probe fix={FIX_B} resolve={resolve} />);
    await waitFor(() => expect(probe().getAttribute("data-label")).toBe("Lagos, Nigeria"));

    // The stale answer for the previous fix arrives late — it must be ignored.
    settleFirst({ place: place("Jimeta, Girei, Adamawa, 640221, Nigeria"), reason: null });
    await flushMicrotasks();

    expect(probe().getAttribute("data-label")).toBe("Lagos, Nigeria");
    expect(probe().getAttribute("data-status")).toBe("resolved");
  });
});
