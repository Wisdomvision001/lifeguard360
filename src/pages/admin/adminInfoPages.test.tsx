import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { JSX } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { AdminUsersPage } from "@/pages/admin/AdminUsersPage";
import { AdminAnalyticsPage } from "@/pages/admin/AdminAnalyticsPage";
import { AdminActivityLogPage } from "@/pages/admin/AdminActivityLogPage";
import { AdminSettingsPage } from "@/pages/admin/AdminSettingsPage";
import { OfflineProvider } from "@/app/providers/OfflineProvider";
import { AuthProvider } from "@/app/providers/AuthProvider";
import { listUserProfiles } from "@/services/admin/adminUserService";
import type { AuthState } from "@/services/auth/authService";

vi.mock("@/services/admin/adminUserService", () => ({
  listUserProfiles: vi.fn(),
}));

const mockListUserProfiles = vi.mocked(listUserProfiles);

function renderPage(ui: JSX.Element, authState: Partial<AuthState> = {}): ReturnType<typeof render> {
  const observer = (onChange: (state: AuthState) => void): (() => void) => {
    onChange({
      user: null,
      profile: null,
      preferences: null,
      claims: {},
      status: "signed-out",
      error: null,
      ...authState,
    } as AuthState);
    return () => undefined;
  };
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <AuthProvider observer={observer}>
        <OfflineProvider>{ui}</OfflineProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockListUserProfiles.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("AdminUsersPage — read-only directory", () => {
  it("auto-loads, shows a real count and renders profiles read-only", async () => {
    mockListUserProfiles.mockResolvedValue([
      {
        uid: "uid-1",
        displayName: "Ada Lovelace",
        createdAt: "2026-01-15T10:00:00.000Z",
        updatedAt: "2026-02-01T10:00:00.000Z",
      },
      {
        uid: "uid-2",
        displayName: "Grace Hopper",
        createdAt: "",
        updatedAt: "",
      },
    ]);
    renderPage(<AdminUsersPage />);
    await waitFor(() => {
      expect(mockListUserProfiles).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText(/2 registered users/i)).toBeInTheDocument();
    expect(screen.getAllByText(/UID/)).toHaveLength(2);
    // Honest handling of a missing timestamp — never a fabricated date.
    expect(screen.getByText(/Joined date not recorded/i)).toBeInTheDocument();
    expect(screen.getAllByText("Read-only")).toHaveLength(2);
  });

  it("shows an honest empty state when no profiles exist", async () => {
    mockListUserProfiles.mockResolvedValue([]);
    renderPage(<AdminUsersPage />);
    expect(await screen.findByText(/no user profiles exist yet/i)).toBeInTheDocument();
  });

  it("shows the loading state while the query runs", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof listUserProfiles>>) => void;
    mockListUserProfiles.mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }),
    );
    renderPage(<AdminUsersPage />);
    const loading = screen.getByText(/loading user profiles/i);
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: /refresh/i })).toBeDisabled();
    resolve([]);
    await waitFor(() => {
      expect(screen.queryByText(/loading user profiles/i)).not.toBeInTheDocument();
    });
  });

  it("surfaces the rules rejection as a real error with retry", async () => {
    mockListUserProfiles.mockRejectedValue(
      new Error("You do not have permission to perform this action."),
    );
    renderPage(<AdminUsersPage />);
    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(/you do not have permission/i);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    // A rejected query never renders fake rows.
    expect(screen.queryByText(/Ada Lovelace/)).not.toBeInTheDocument();
  });

  it("warns a signed-in non-admin that rules will reject the query", async () => {
    mockListUserProfiles.mockResolvedValue([]);
    renderPage(<AdminUsersPage />, {
      status: "signed-in",
      user: { uid: "u1", email: "a@b.c", displayName: "Plain", emailVerified: true },
      claims: {},
    });
    expect(
      await screen.findByText(/signed in without an admin claim/i),
    ).toBeInTheDocument();
  });
});

describe("AdminAnalyticsPage — truthful no-dataset state", () => {
  it("states that no analytics dataset exists and invents none", () => {
    renderPage(<AdminAnalyticsPage />);
    expect(screen.getByText("No analytics data yet")).toBeInTheDocument();
    expect(screen.getByText("No analytics dataset")).toBeInTheDocument();
    expect(screen.getByText("Backend connection required")).toBeInTheDocument();
    expect(screen.getByText(/does not currently collect analytics/i)).toBeInTheDocument();
    // No invented numbers anywhere.
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\d+%/);
    expect(text).not.toMatch(/\d+\s+(views|visits|users|sessions)/i);
  });

  it("describes what real analytics will require", () => {
    renderPage(<AdminAnalyticsPage />);
    expect(screen.getByText(/a data source/i)).toBeInTheDocument();
    expect(screen.getByText(/aggregation/i)).toBeInTheDocument();
    expect(screen.getByText(/read access for admins/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /activity log/i })).toHaveAttribute(
      "href",
      "/admin/activity",
    );
  });
});

describe("AdminActivityLogPage — honest per-user model", () => {
  it("explains why no records are shown and lists the real event types", () => {
    renderPage(<AdminActivityLogPage />);
    expect(screen.getByText("No admin-readable activity yet")).toBeInTheDocument();
    expect(screen.getByText("No records available")).toBeInTheDocument();
    expect(screen.getByText(/restrict it to\s+the owner/i)).toBeInTheDocument();
    for (const type of [
      "contact_added",
      "contact_updated",
      "contact_deleted",
      "location_shared",
      "emergency_action",
      "offline_download",
    ]) {
      expect(screen.getByText(type)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /users/i })).toHaveAttribute("href", "/admin/users");
  });

  it("renders no fabricated records or timestamps", () => {
    renderPage(<AdminActivityLogPage />);
    const text = document.body.textContent ?? "";
    // No fabricated ISO timestamps or record counts anywhere on the page.
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: /admin login/i })).not.toBeInTheDocument();
  });
});

describe("AdminSettingsPage — real values only", () => {
  it("shows the real content version and source without fake switches", () => {
    renderPage(<AdminSettingsPage />);
    expect(screen.getByText(/0\.1\.0-unreviewed/)).toBeInTheDocument();
    expect(screen.getByText(/fallback dataset \(6 categories\)/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByText(/no client-side overrides/i)).toBeInTheDocument();
  });

  it("labels unimplemented areas honestly", () => {
    renderPage(<AdminSettingsPage />);
    expect(screen.getByText("Not yet implemented")).toBeInTheDocument();
    expect(screen.getByText(/editable application settings/i)).toBeInTheDocument();
  });
});
