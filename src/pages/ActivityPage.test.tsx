import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { ActivityPage } from "@/pages/ActivityPage";
import { AuthProvider } from "@/app/providers/AuthProvider";
import type { AuthState } from "@/services/auth/authService";
import { logDemoActivity } from "@/services/activity/demoActivityStore";
import { listActivity, logActivity } from "@/services/activity/activityService";
import type * as ActivityServiceModule from "@/services/activity/activityService";

/**
 * Unauthenticated Activity (temporary authentication bypass, Task 2).
 *
 * Pins the unauthenticated branch contract from the audit:
 *  - signed-out users read the device-local activity store synchronously
 *    (derive-don't-store — no effect, no loading loop);
 *  - no Firestore/getDb call ever happens while signed out;
 *  - the disclosure is honest about device-local storage;
 *  - location_shared records never persist exact coordinates while signed out;
 *  - signed-in users keep the unchanged listActivity(uid) Firestore path.
 *
 * The activity service is partially mocked: listActivity is a spy, while
 * logActivity stays REAL so the signed-out logging path is exercised end to
 * end. getDb is mocked to THROW so any Firestore touch while signed out fails
 * the test loudly.
 */

vi.mock("@/services/activity/activityService", async (importOriginal) => {
  const actual = await importOriginal<typeof ActivityServiceModule>();
  return { ...actual, listActivity: vi.fn(() => Promise.resolve([])) };
});

vi.mock("@/services/firebase/client", () => ({
  isFirebaseConfigured: vi.fn(() => true),
  getDb: vi.fn(() => {
    throw new Error("Firestore must never be initialised in the signed-out Activity flow");
  }),
  getAuthInstance: vi.fn(() => {
    throw new Error("Auth must never be initialised beyond the auth observer in tests");
  }),
}));

vi.mock("@/services/auth/authService", () => ({
  observeAuth: vi.fn((callback: (state: AuthState) => void): (() => void) => {
    callback({
      user: null,
      profile: null,
      preferences: null,
      status: "signed-out",
      error: null,
    });
    return () => undefined;
  }),
}));

function renderActivity(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={["/activity"]}>
      <AuthProvider>
        <ActivityPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("ActivityPage — unauthenticated (device-local activity)", () => {
  it("activity appears immediately while signed out (no loading spinner)", () => {
    logDemoActivity("emergency_action", {
      action: "call_initiated",
      contactId: "demo-1",
      observedState: "composer-opened",
    });

    renderActivity();

    expect(screen.getByText(/A call to a trusted contact was started/i)).toBeTruthy();
    expect(screen.queryByText(/Loading your activity/i)).toBeNull();
  });

  it("an empty device-local store gets the honest empty state (no spinner)", () => {
    renderActivity();

    expect(screen.getByText(/No activity yet/i)).toBeTruthy();
    expect(screen.queryByText(/Loading your activity/i)).toBeNull();
  });

  it("the unauthenticated disclosure appears and states nothing is sent to Firestore", () => {
    renderActivity();

    expect(screen.getByText(/Not signed in — saved on this device/i)).toBeTruthy();
    expect(screen.getByText(/nothing is sent to Firestore/i)).toBeTruthy();
  });

  it("the disclosure states that signing in does not migrate the local history", () => {
    renderActivity();

    expect(
      screen.getByText(/Signing in later does not move this history into an account/i),
    ).toBeTruthy();
  });

  it("the signed-out path never calls Firestore (getDb would throw)", async () => {
    const { getDb } = await import("@/services/firebase/client");

    renderActivity();

    expect(vi.mocked(getDb)).not.toHaveBeenCalled();
    expect(vi.mocked(listActivity)).not.toHaveBeenCalled();
  });

  it("location_shared logging never persists exact coordinates while signed out", async () => {
    await logActivity(null, "location_shared", {
      via: "get-help",
      coordinates: { latitude: 9.2, longitude: 12.5 },
    });

    renderActivity();

    expect(screen.getByText(/Your location was requested in Get Help Now/i)).toBeTruthy();
    const stored = JSON.parse(
      window.localStorage.getItem("lifeguard360.demoActivity.v1") as string,
    ) as Array<{ detail: Record<string, unknown> }>;
    expect(stored[0].detail.coordinates).toBeUndefined();
    expect(stored[0].detail.via).toBe("get-help");
  });
});

describe("ActivityPage — authenticated path unchanged", () => {
  it("a signed-in user keeps using the Firestore activity path (listActivity)", async () => {
    const { observeAuth: mockedObserve } = await import("@/services/auth/authService");
    vi.mocked(mockedObserve).mockImplementation((callback: (state: AuthState) => void) => {
      callback({
        user: { uid: "user-1", email: "user@example.com", displayName: "Test User" },
        profile: null,
        preferences: null,
        status: "signed-in",
        error: null,
      });
      return () => undefined;
    });

    vi.mocked(listActivity).mockResolvedValue([
      {
        id: "firestore-activity-1",
        type: "contact_added",
        detail: { relationship: "Parent" },
        createdAt: "",
      },
    ]);

    renderActivity();

    await waitFor(() => {
      expect(vi.mocked(listActivity)).toHaveBeenCalledWith("user-1");
    });
    expect(await screen.findByText(/A new Parent contact was added/i)).toBeTruthy();
    expect(screen.queryByText(/Not signed in — saved on this device/i)).toBeNull();
    expect(screen.queryByText(/Loading your activity/i)).toBeNull();
  });
});
