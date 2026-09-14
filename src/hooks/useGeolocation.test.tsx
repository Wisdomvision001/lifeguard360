import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useGeolocation } from "@/hooks/useGeolocation";
import type { LocationOutcome } from "@/services/location/locationService";
import type { LocationFix } from "@/types";

const FIX: LocationFix = {
  coordinates: { latitude: 9.0765, longitude: 7.3986 },
  accuracy: 30,
  timestamp: 1_700_000_000_000,
  source: "unknown",
  quality: "good",
};

const OK: LocationOutcome = { fix: FIX, error: null };

describe("useGeolocation delegation (Phase 5B)", () => {
  it("delegates acquisition to the injected service and exposes the fix", async () => {
    const acquire = vi.fn().mockResolvedValue(OK);
    const { result } = renderHook(() => useGeolocation(acquire));

    await act(async () => {
      await result.current.requestFix();
    });

    expect(acquire).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.status).toBe("granted"));
    expect(result.current.fix).toEqual(FIX);
    expect(result.current.message).toBeNull();
  });

  it("maps a permission-denied outcome to the denied status and honest copy", async () => {
    const acquire = vi.fn().mockResolvedValue({ fix: null, error: "Location permission was denied." });
    const { result } = renderHook(() => useGeolocation(acquire));

    await act(async () => {
      const fix = await result.current.requestFix();
      expect(fix).toBeNull();
    });

    expect(result.current.status).toBe("denied");
    expect(result.current.message).toContain("Enable it in your browser settings");
  });

  it("maps a timeout outcome to the unavailable status and timeout copy", async () => {
    const acquire = vi.fn().mockResolvedValue({ fix: null, error: "Location request timed out." });
    const { result } = renderHook(() => useGeolocation(acquire));

    await act(async () => {
      await result.current.requestFix();
    });

    expect(result.current.status).toBe("unavailable");
    expect(result.current.message).toContain("timed out");
  });

  it("maps a position-unavailable outcome to the unavailable status", async () => {
    const acquire = vi.fn().mockResolvedValue({ fix: null, error: "Your position could not be determined." });
    const { result } = renderHook(() => useGeolocation(acquire));

    await act(async () => {
      await result.current.requestFix();
    });

    expect(result.current.status).toBe("unavailable");
  });

  it("maps a validation-rejected payload to the invalid status with the service copy", async () => {
    const acquire = vi.fn().mockResolvedValue({
      fix: null,
      error: "The location provided by your device was invalid. Please try again.",
    });
    const { result } = renderHook(() => useGeolocation(acquire));

    await act(async () => {
      await result.current.requestFix();
    });

    expect(result.current.status).toBe("invalid");
    expect(result.current.fix).toBeNull();
  });

  it("starts idle and reset returns to idle after a request", async () => {
    const acquire = vi.fn().mockResolvedValue(OK);
    const { result } = renderHook(() => useGeolocation(acquire));

    expect(result.current.status).toBe("idle");
    await act(async () => {
      await result.current.requestFix();
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.fix).toBeNull();
  });
});
