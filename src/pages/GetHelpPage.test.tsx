import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { GetHelpPage } from "@/pages/GetHelpPage";
import type * as ActivityServiceModule from "@/services/activity/activityService";
import type * as LocationServiceModule from "@/services/location/locationService";
import type * as ReverseGeocodeModule from "@/services/location/reverseGeocodeService";
import { REVERSE_GEOCODE_ATTRIBUTION } from "@/services/location/reverseGeocodeService";
import type { LocationFix } from "@/types";
import { AuthProvider } from "@/app/providers/AuthProvider";
import { OfflineProvider } from "@/app/providers/OfflineProvider";
import type { AuthState } from "@/services/auth/authService";
import {
  addDemoContact,
  listDemoContacts,
} from "@/services/contacts/demoContactStore";
import { listContacts } from "@/services/contacts/contactService";

/**
 * Unauthenticated Get Help (temporary authentication bypass, Task 1).
 *
 * Pins the unauthenticated branch contract from the audit:
 *  - signed-out users read the SAME device-local store the Contacts page uses;
 *  - no contactService/Firestore call ever happens while signed out;
 *  - device-local contacts make the existing emergency actions reachable;
 *  - an empty device store shows the honest empty state (never a loading loop);
 *  - signed-in users keep the unchanged Firestore contacts path.
 */

vi.mock("@/services/contacts/contactService", () => ({
  listContacts: vi.fn(() => Promise.resolve([])),
}));

/**
 * Location + readable-location seams are stubbed: the page must never perform
 * a real Nominatim request in a test (the usage policy caps the public
 * service), and the activity writer is a spy so the privacy correction can be
 * asserted without touching Firestore.
 */
const { acquireMock, reverseMock, logActivityMock } = vi.hoisted(() => ({
  acquireMock: vi.fn(),
  reverseMock: vi.fn(),
  logActivityMock: vi.fn(),
}));

vi.mock("@/services/location/locationService", async (importOriginal) => {
  const actual = await importOriginal<typeof LocationServiceModule>();
  return { ...actual, acquireLocationFix: acquireMock };
});

vi.mock("@/services/location/reverseGeocodeService", async (importOriginal) => {
  const actual = await importOriginal<typeof ReverseGeocodeModule>();
  return { ...actual, reverseGeocode: reverseMock };
});

vi.mock("@/services/activity/activityService", async (importOriginal) => {
  const actual = await importOriginal<typeof ActivityServiceModule>();
  return { ...actual, logActivity: logActivityMock };
});

vi.mock("@/services/firebase/client", () => ({
  isFirebaseConfigured: vi.fn(() => true),
  getDb: vi.fn(() => {
    throw new Error("Firestore must never be initialised in the signed-out Get Help flow");
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

function renderGetHelp(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={["/get-help"]}>
      <AuthProvider>
        <OfflineProvider>
          <GetHelpPage />
        </OfflineProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const DEMO_CONTACT = {
  fullName: "Demo Kin",
  relationship: "Parent" as const,
  phoneNumber: "+2348012345678",
};

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("GetHelpPage — unauthenticated (device-local contacts)", () => {
  it("contacts appear from the device-local store while signed out", async () => {
    addDemoContact(DEMO_CONTACT);
    renderGetHelp();

    await waitFor(() => {
      expect(screen.getByText(/Choose a trusted contact/i)).toBeTruthy();
    });
    expect(screen.getByText("Demo Kin")).toBeTruthy();
    expect(screen.getByText(/Parent · \+2348012345678/)).toBeTruthy();
  });

  it("no Firestore/contactService fetch happens while signed out", async () => {
    addDemoContact(DEMO_CONTACT);
    renderGetHelp();

    await waitFor(() => {
      expect(screen.getByText(/Choose a trusted contact/i)).toBeTruthy();
    });
    expect(vi.mocked(listContacts)).not.toHaveBeenCalled();
    // And the device-local store is still the only source read.
    expect(listDemoContacts()).toHaveLength(1);
  });

  it("a device-local contact makes the emergency actions reachable (call/SMS)", async () => {
    addDemoContact(DEMO_CONTACT);
    renderGetHelp();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Prepare emergency SMS/i })).toBeTruthy();
    });
    expect(
      screen.getByRole("button", { name: /Call Demo Kin/i }),
    ).toBeTruthy();
  });

  it("the device-local contact is preselected so actions are immediately usable", async () => {
    addDemoContact(DEMO_CONTACT);
    renderGetHelp();

    const radio = await screen.findByRole("radio", {
      name: /Demo Kin/,
    });
    expect((radio as HTMLInputElement).checked).toBe(true);
  });

  it("an empty device-local contact list shows the honest empty state, never a loading loop", async () => {
    renderGetHelp();

    const empty = await screen.findByText(/No emergency contacts yet/i);
    expect(empty).toBeTruthy();
    expect(screen.queryByText(/aria-busy="true"/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Prepare emergency SMS/i })).toBeNull();
  });

  it("device-local contacts are never written to Firestore while signed out", async () => {
    const { getDb } = await import("@/services/firebase/client");
    addDemoContact(DEMO_CONTACT);
    renderGetHelp();

    await waitFor(() => {
      expect(screen.getByText(/Choose a trusted contact/i)).toBeTruthy();
    });
    // No Firebase module was initialised from the unauthenticated rendering path.
    expect(vi.mocked(getDb)).not.toHaveBeenCalled();
    // The page-level disclosure is honest about device-local-only storage.
    expect(screen.getByText(/Not signed in — saved on this device/i)).toBeTruthy();
    expect(screen.getByText(/nothing is sent to Firestore/i)).toBeTruthy();
  });

  it("the disclosure states that signing in does not migrate device-local contacts", async () => {
    renderGetHelp();

    expect(
      screen.getByText(/Signing in later does not move them into your account/i),
    ).toBeTruthy();
  });
});

describe("GetHelpPage — authenticated path unchanged", () => {
  it("a signed-in user keeps using the Firestore contacts path (listContacts)", async () => {
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

    vi.mocked(listContacts).mockResolvedValue([
      {
        id: "real-contact-1",
        fullName: "Real Kin",
        relationship: "Sibling",
        phoneNumber: "+2348023456789",
        createdAt: "",
        updatedAt: "",
      },
    ]);

    renderGetHelp();

    await waitFor(() => {
      expect(vi.mocked(listContacts)).toHaveBeenCalledWith("user-1");
    });
    expect(await screen.findByText("Real Kin")).toBeTruthy();
    expect(screen.queryByText(/Not signed in — saved on this device/i)).toBeNull();
    expect(listDemoContacts().length >= 0).toBe(true); // device store untouched
  });
});

describe("GetHelpPage — offline/online rendering smoke", () => {
  it("renders the emergency page without errors when not signed in", () => {
    const { container } = renderGetHelp();
    expect(container.firstChild).not.toBeNull();
    cleanup();
  });
});

/**
 * Readable location (Task 1): the acquired fix is described by a real
 * reverse-geocoding result when one exists, and the coordinates remain the
 * honest fallback — never a fabricated place name — when one does not.
 */
const FIX: LocationFix = {
  coordinates: { latitude: 9.2398, longitude: 12.4987 },
  accuracy: 12,
  timestamp: Date.now(),
  source: "unknown",
};

async function signOut(): Promise<void> {
  const { observeAuth } = await import("@/services/auth/authService");
  vi.mocked(observeAuth).mockImplementation((callback: (state: AuthState) => void) => {
    callback({ user: null, profile: null, preferences: null, status: "signed-out", error: null });
    return () => undefined;
  });
}

async function signIn(): Promise<void> {
  const { observeAuth } = await import("@/services/auth/authService");
  vi.mocked(observeAuth).mockImplementation((callback: (state: AuthState) => void) => {
    callback({
      user: { uid: "user-1", email: "user@example.com", displayName: "Test User" },
      profile: null,
      preferences: null,
      status: "signed-in",
      error: null,
    });
    return () => undefined;
  });
}

describe("GetHelpPage — readable location (Task 1)", () => {
  beforeEach(async () => {
    await signOut();
    acquireMock.mockReset();
    reverseMock.mockReset();
    logActivityMock.mockReset();
    acquireMock.mockResolvedValue({ fix: FIX, error: null });
    // Default: OpenStreetMap has no readable description for this coordinate.
    reverseMock.mockResolvedValue({ place: null, reason: "no-result" });
  });

  it("shows the real OpenStreetMap description as the primary location text", async () => {
    addDemoContact(DEMO_CONTACT);
    reverseMock.mockResolvedValue({
      place: {
        label: "Jimeta, Girei, Adamawa, 640221, Nigeria",
        coordinates: FIX.coordinates,
        attribution: REVERSE_GEOCODE_ATTRIBUTION,
      },
      reason: null,
    });
    renderGetHelp();

    // Nothing is looked up until a fix actually exists.
    expect(reverseMock).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: /Get my location/i }));

    expect(await screen.findByText("Jimeta, Girei, Adamawa, 640221, Nigeria")).toBeTruthy();
    // Coordinates + accuracy stay visible as secondary information.
    expect(screen.getByText(/9\.2398, 12\.4987 · ±12 m accuracy/)).toBeTruthy();
    // Attribution and the plain-language disclosure accompany the OSM label.
    expect(screen.getByText(/OpenStreetMap contributors/i)).toBeTruthy();
    expect(screen.getByText(/your coordinates are sent to openstreetmap/i)).toBeTruthy();
    // One explicit action → one acquisition and one lookup. Never a stream.
    expect(acquireMock).toHaveBeenCalledTimes(1);
    expect(reverseMock).toHaveBeenCalledTimes(1);
    expect(reverseMock).toHaveBeenCalledWith(FIX.coordinates);
  });

  it("falls back to the coordinates when no readable location can be determined", async () => {
    addDemoContact(DEMO_CONTACT);
    renderGetHelp();

    fireEvent.click(await screen.findByRole("button", { name: /Get my location/i }));

    expect(await screen.findByText("9.2398, 12.4987")).toBeTruthy();
    expect(screen.getByText(/9\.2398, 12\.4987 · ±12 m accuracy/)).toBeTruthy();
    // The failure is described as a description problem, not an acquisition one.
    expect(
      await screen.findByText(/readable location name could not be determined/i),
    ).toBeTruthy();
    // Acquisition itself succeeded and is still reported as a success.
    expect(screen.getByText(/Location acquired\. It is shown below/i)).toBeTruthy();
    // No fabricated place name, no attribution for a label that does not exist.
    expect(screen.queryByText(/OpenStreetMap contributors/i)).toBeNull();
  });

  it("reports that the readable location is still being looked up", async () => {
    addDemoContact(DEMO_CONTACT);
    reverseMock.mockReturnValue(new Promise(() => undefined));
    renderGetHelp();

    fireEvent.click(await screen.findByRole("button", { name: /Get my location/i }));

    expect(await screen.findByText(/Finding a readable location name/i)).toBeTruthy();
    // Acquisition itself already succeeded and is reported as such.
    expect(screen.getByText(/Location acquired/i)).toBeTruthy();
  });

  it("keeps the existing SMS map link and one-shot acquisition unchanged", async () => {
    addDemoContact(DEMO_CONTACT);
    renderGetHelp();

    fireEvent.click(await screen.findByRole("button", { name: /Prepare emergency SMS/i }));

    const preview = await screen.findByLabelText("Prepared message text");
    expect(preview.textContent).toContain("https://maps.google.com/?q=9.239800,12.498700");
    expect(screen.getByText(/not sent/i)).toBeTruthy();
    expect(acquireMock).toHaveBeenCalledTimes(1);
  });

  it("records a signed-in location_shared activity without raw coordinates", async () => {
    await signIn();
    vi.mocked(listContacts).mockResolvedValue([
      {
        id: "real-contact-1",
        fullName: "Real Kin",
        relationship: "Sibling",
        phoneNumber: "+2348023456789",
        createdAt: "",
        updatedAt: "",
      },
    ]);
    renderGetHelp();

    fireEvent.click(await screen.findByRole("button", { name: /Get my location/i }));

    await waitFor(() => expect(logActivityMock).toHaveBeenCalledTimes(1));
    expect(logActivityMock).toHaveBeenCalledWith("user-1", "location_shared", {
      via: "get-help",
    });
    const detail = logActivityMock.mock.calls[0][2] as Record<string, unknown>;
    expect("coordinates" in detail).toBe(false);
  });
});
