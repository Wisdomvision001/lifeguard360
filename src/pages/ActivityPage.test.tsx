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
 * Guest-mode Activity (Guest Mode Task 2).
 *
 * Pins the guest branch contract from the audit:
 *  - guests read the browser-local demo activity store synchronously
 *    (derive-don't-store — no effect, no loading loop);
 *  - no Firestore/getDb call ever happens on the guest path;
 *  - the demo disclosure is honest about local-only storage;
 *  - guest location_shared records never persist exact coordinates;
 *  - signed-in users keep the unchanged listActivity(uid) Firestore path.
 *
 * The activity service is partially mocked: listActivity is a spy, while
 * logActivity stays REAL so the guest logging path is exercised end to end.
 * getDb is mocked to THROW so any guest Firestore touch fails the test loudly.
 */

vi.mock("@/services/activity/activityService", async (importOriginal) => {
  const actual = await importOriginal<typeof ActivityServiceModule>();
  return { ...actual, listActivity: vi.fn(() => Promise.resolve([])) };
});

vi.mock("@/services/firebase/client", () => ({
  isFirebaseConfigured: vi.fn(() => true),
  getDb: vi.fn(() => {
    throw new Error("Firestore must never be initialised in the guest Activity flow");
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

describe("ActivityPage — guest mode (demo activity)", () => {
  it("a guest sees demo activity immediately with no loading spinner", () => {
    logDemoActivity("emergency_action", {
      action: "call_initiated",
      contactId: "demo-1",
      observedState: "composer-opened",
    });

    renderActivity();

    expect(screen.getByText(/A call to a trusted contact was started/i)).toBeTruthy();
    expect(screen.queryByText(/Loading your activity/i)).toBeNull();
  });

  it("a guest with an empty demo store gets the honest empty state (no spinner)", () => {
    renderActivity();

    expect(screen.getByText(/No activity yet/i)).toBeTruthy();
    expect(screen.queryByText(/Loading your activity/i)).toBeNull();
  });

  it("the demo disclosure appears and states nothing is sent to Firestore", () => {
    renderActivity();

    expect(screen.getByText(/Demo mode — saved in this browser only/i)).toBeTruthy();
    expect(screen.getByText(/nothing is sent to Firestore/i)).toBeTruthy();
  });

  it("the disclosure states that signing in does not migrate demo activity", () => {
    renderActivity();

    expect(
      screen.getByText(/Signing in later does not move demo activity into an account/i),
    ).toBeTruthy();
  });

  it("the guest path never calls Firestore (getDb would throw)", async () => {
    const { getDb } = await import("@/services/firebase/client");

    renderActivity();

    expect(vi.mocked(getDb)).not.toHaveBeenCalled();
    expect(vi.mocked(listActivity)).not.toHaveBeenCalled();
  });

  it("guest location_shared logging never persists exact coordinates", async () => {
    await logActivity(null, "location_shared", {
      via: "get-help",
      coordinates: { latitude: 9.2, longitude: 12.5 },
    });

    renderActivity();

    expect(screen.getByText(/Your location was shared from Get Help Now/i)).toBeTruthy();
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
    expect(screen.queryByText(/Demo mode — saved in this browser only/i)).toBeNull();
    expect(screen.queryByText(/Loading your activity/i)).toBeNull();
  });
});
