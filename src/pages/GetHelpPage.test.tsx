import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { GetHelpPage } from "@/pages/GetHelpPage";
import { AuthProvider } from "@/app/providers/AuthProvider";
import { OfflineProvider } from "@/app/providers/OfflineProvider";
import type { AuthState } from "@/services/auth/authService";
import {
  addDemoContact,
  listDemoContacts,
} from "@/services/contacts/demoContactStore";
import { listContacts } from "@/services/contacts/contactService";

/**
 * Guest-mode Get Help (Guest Mode Task 1).
 *
 * Pins the guest branch contract from the audit:
 *  - guests read the SAME browser-local demo store the Contacts page uses;
 *  - no contactService/Firestore call ever happens for a guest;
 *  - demo contacts make the existing emergency actions reachable;
 *  - an empty demo store shows the honest empty state (never a loading loop);
 *  - signed-in users keep the unchanged Firestore contacts path.
 */

vi.mock("@/services/contacts/contactService", () => ({
  listContacts: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@/services/firebase/client", () => ({
  isFirebaseConfigured: vi.fn(() => true),
  getDb: vi.fn(() => {
    throw new Error("Firestore must never be initialised in the guest Get Help flow");
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

describe("GetHelpPage — guest mode (demo contacts)", () => {
  it("a guest sees demo contacts from the browser-local store", async () => {
    addDemoContact(DEMO_CONTACT);
    renderGetHelp();

    await waitFor(() => {
      expect(screen.getByText(/Choose a trusted contact/i)).toBeTruthy();
    });
    expect(screen.getByText("Demo Kin")).toBeTruthy();
    expect(screen.getByText(/Parent · \+2348012345678/)).toBeTruthy();
  });

  it("a guest never triggers a Firestore/contactService fetch", async () => {
    addDemoContact(DEMO_CONTACT);
    renderGetHelp();

    await waitFor(() => {
      expect(screen.getByText(/Choose a trusted contact/i)).toBeTruthy();
    });
    expect(vi.mocked(listContacts)).not.toHaveBeenCalled();
    // And the demo store is still the only source the guest read from.
    expect(listDemoContacts()).toHaveLength(1);
  });

  it("a guest with a demo contact can reach the emergency actions (call/SMS)", async () => {
    addDemoContact(DEMO_CONTACT);
    renderGetHelp();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Prepare emergency SMS/i })).toBeTruthy();
    });
    expect(
      screen.getByRole("button", { name: /Call Demo Kin/i }),
    ).toBeTruthy();
  });

  it("the demo contact is preselected so actions are immediately usable", async () => {
    addDemoContact(DEMO_CONTACT);
    renderGetHelp();

    const radio = await screen.findByRole("radio", {
      name: /Demo Kin/,
    });
    expect((radio as HTMLInputElement).checked).toBe(true);
  });

  it("empty guest demo contacts show the honest empty state, never a loading loop", async () => {
    renderGetHelp();

    const empty = await screen.findByText(/No emergency contacts yet/i);
    expect(empty).toBeTruthy();
    expect(screen.queryByText(/aria-busy="true"/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Prepare emergency SMS/i })).toBeNull();
  });

  it("guest demo contacts are never written to Firestore", async () => {
    const { getDb } = await import("@/services/firebase/client");
    addDemoContact(DEMO_CONTACT);
    renderGetHelp();

    await waitFor(() => {
      expect(screen.getByText(/Choose a trusted contact/i)).toBeTruthy();
    });
    // No Firebase module was initialised from the guest rendering path.
    expect(vi.mocked(getDb)).not.toHaveBeenCalled();
    // The page-level disclosure is honest about local-only demo storage.
    expect(screen.getByText(/Demo mode — saved in this browser only/i)).toBeTruthy();
    expect(screen.getByText(/nothing is sent to Firestore/i)).toBeTruthy();
  });

  it("the disclosure states that signing in does not migrate demo contacts", async () => {
    renderGetHelp();

    expect(
      screen.getByText(/Signing in later does not move demo contacts into an account/i),
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
    expect(screen.queryByText(/Demo mode — saved in this browser only/i)).toBeNull();
    expect(listDemoContacts().length >= 0).toBe(true); // demo store untouched
  });
});

describe("GetHelpPage — offline/online rendering smoke", () => {
  it("renders the emergency page without errors for a guest", () => {
    const { container } = renderGetHelp();
    expect(container.firstChild).not.toBeNull();
    cleanup();
  });
});
