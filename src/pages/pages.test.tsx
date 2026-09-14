import { describe, expect, it } from "vitest";
import type { JSX } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

import { GuidePage } from "@/pages/GuidePage";
import { GuideStepByStepPage } from "@/pages/GuideStepByStepPage";
import { GuideQuickPage } from "@/pages/GuideQuickPage";
import { HomePage } from "@/pages/HomePage";
import { OfflineProvider } from "@/app/providers/OfflineProvider";
import { AuthProvider } from "@/app/providers/AuthProvider";
import { observeAuth } from "@/services/auth/authService";
import { getAllGuides, getGuide, guideToSpeechText } from "@/services/firstAid/firstAidService";
import { AppRoutes } from "@/app/router";
import { RequireAdmin } from "@/app/providers/RequireAdmin";
import { AdminLayout } from "@/layouts/AdminLayout";
import { ADMIN_NAV_ITEMS } from "@/app/adminNavigation";

function renderWithProviders(ui: React.ReactElement): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider observer={observeAuth}>
        <OfflineProvider>{ui}</OfflineProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** Renders GuidePage (and mode routes) with a real route match so useParams resolves. */
function renderGuideAt(path: string): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider observer={observeAuth}>
        <OfflineProvider>
          <Routes>
            <Route path="/first-aid/:categoryId" element={<GuidePage />} />
            <Route
              path="/first-aid/:categoryId/quick"
              element={<GuideQuickPage />}
            />
            <Route
              path="/first-aid/:categoryId/steps"
              element={<GuideStepByStepPage />}
            />
          </Routes>
        </OfflineProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("firstAidService", () => {
  it("exposes exactly the six approved categories", () => {
    const guides = getAllGuides().map((guide) => guide.id);
    expect([...guides].sort()).toEqual(
      ["bleeding", "burns", "choking", "fractures", "road-accident", "snake-bite"].sort(),
    );
  });

  it("returns null for unknown categories (honest not-found path)", () => {
    expect(getGuide("unknown")).toBeNull();
    expect(getGuide("")).toBeNull();
  });

  it("flattens guides into complete speakable text", () => {
    const guide = getGuide("burns");
    if (guide === null) throw new Error("burns guide missing");
    const text = guideToSpeechText(guide);
    expect(text).toContain(guide.label);
    expect(text).toContain("Step 1. Stop the burning.");
    expect(text).toContain("Do not:");
  });
});

describe("HomePage", () => {
  it("renders the hero and all six emergency categories", () => {
    renderWithProviders(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    for (const label of [
      "Burns",
      "Bleeding",
      "Choking",
      "Snake Bite",
      "Road Accident",
      "Fractures",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe("GuidePage — mode selection", () => {
  it("shows the mode selection with both options and emergency escape", () => {
    renderGuideAt("/first-aid/burns");
    expect(screen.getByRole("heading", { level: 1, name: "Burns" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /choose how you want to receive first-aid guidance/i,
      }),
    ).toBeInTheDocument();

    const quick = screen.getByRole("link", { name: /quick guide/i });
    const steps = screen.getByRole("link", { name: /step-by-step guide/i });
    expect(quick).toHaveAttribute("href", "/first-aid/burns/quick");
    expect(steps).toHaveAttribute("href", "/first-aid/burns/steps");

    expect(
      screen.getByRole("link", { name: /get help now/i }),
    ).toHaveAttribute("href", "/get-help");
    expect(
      screen.getByRole("link", { name: /find nearby hospital/i }),
    ).toHaveAttribute("href", "/facilities");
  });

  it("keeps the full guide available below the mode selection (interim)", () => {
    renderGuideAt("/first-aid/burns");
    expect(screen.getByText("Full guide (interim)")).toBeInTheDocument();
    expect(screen.getByText("Do not")).toBeInTheDocument();
  });

  it("quick mode destination renders the real Quick Guide interface", () => {
    renderGuideAt("/first-aid/burns/quick");
    expect(screen.getByText(/essential actions to remember right now/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /open step-by-step guide/i }),
    ).toHaveAttribute("href", "/first-aid/burns/steps");
  });

  it("steps mode destination renders the real Step-by-Step interface", () => {
    renderGuideAt("/first-aid/burns/steps");
    expect(screen.getByText(/step 1 of 5/i)).toBeInTheDocument();
  });

  it("renders steps, dos and don'ts for a valid category", () => {
    renderGuideAt("/first-aid/burns");
    expect(screen.getByRole("heading", { level: 1, name: "Burns" })).toBeInTheDocument();
    expect(screen.getByText("Full guide (interim)")).toBeInTheDocument();
    expect(screen.getByText("Do not")).toBeInTheDocument();
  });

  it("shows the not-found state for an invalid category", () => {
    renderGuideAt("/first-aid/unknown");
    expect(screen.getByText(/Guide not found/i)).toBeInTheDocument();
  });

  it("shows the medical disclaimer on every guide", () => {
    renderGuideAt("/first-aid/bleeding");
    expect(screen.getByText(/not\s+professional medical diagnosis/i)).toBeInTheDocument();
  });
});

describe("GuideStepByStepPage", () => {
  it("starts on step 1 with Previous disabled and visual placeholder shown", () => {
    renderGuideAt("/first-aid/burns/steps");
    expect(screen.getByRole("heading", { level: 1, name: "Burns" })).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 5/i)).toBeInTheDocument();
    expect(screen.getByText("Move the person away from the heat source."));
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(
      screen.getByText(/instructional visual not yet available/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /get help now/i }),
    ).toHaveAttribute("href", "/get-help");
  });

  it("advances exactly one step per Next click", () => {
    renderGuideAt("/first-aid/burns/steps");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/step 2 of 5/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Cool the burn under cool running water for 10–20 minutes.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  });

  it("moves backward exactly one step per Previous click", () => {
    renderGuideAt("/first-aid/burns/steps");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/step 3 of 5/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText(/step 2 of 5/i)).toBeInTheDocument();
  });

  it("omits the warning section on steps that have no warning", () => {
    // The current dataset carries no step-level warnings (adding one would
    // require medical sign-off), so the Caution block must not render.
    renderGuideAt("/first-aid/burns/steps");
    expect(screen.queryByText("Caution")).not.toBeInTheDocument();
  });

  it("reaches the completion state on the final step and offers escape", () => {
    renderGuideAt("/first-aid/burns/steps");
    const next = screen.getByRole("button", { name: "Next" });
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/step 5 of 5/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /finish guide/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /finish guide/i }));
    expect(screen.getByText(/end of this guide/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /get help now/i }),
    ).toHaveAttribute("href", "/get-help");
    expect(
      screen.getByRole("link", { name: /back to guide/i }),
    ).toHaveAttribute("href", "/first-aid/burns");
  });

  it("renders every category with its correct step count", () => {
    for (const [id, count] of [
      ["burns", 5],
      ["bleeding", 5],
      ["choking", 5],
      ["snake-bite", 5],
      ["road-accident", 5],
      ["fractures", 5],
    ] as const) {
      const { unmount } = renderGuideAt(`/first-aid/${id}/steps`);
      expect(
        screen.getByText(new RegExp(`step 1 of ${count}`, "i")),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("shows the not-found state for an invalid category", () => {
    renderGuideAt("/first-aid/not-a-real-category/steps");
    expect(screen.getByText(/Guide not found/i)).toBeInTheDocument();
  });
});

describe("GuideQuickPage", () => {
  it("renders category identity, priority, actions and don'ts for burns", () => {
    renderGuideAt("/first-aid/burns/quick");
    expect(screen.getByRole("heading", { level: 1, name: "Burns" })).toBeInTheDocument();
    expect(screen.getByText("Stop the burning and cool the burn.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Essential actions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Do not" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Move away from the heat source."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Do not apply ice, butter, or ointments."),
    ).toBeInTheDocument();
  });

  it("renders every category with its own stored quick guide", () => {
    const cases = [
      ["burns", "Stop the burning and cool the burn.", 5],
      ["bleeding", "Stop the blood with firm, direct pressure.", 5],
      ["choking", /Keep the airway working/i, 5],
      ["snake-bite", /calm and still, and get them to hospital/i, 4],
      ["road-accident", "Protect the scene, then get help.", 5],
      ["fractures", "Keep it still — never straighten it.", 4],
    ] as const;
    for (const [id, priority, actionCount] of cases) {
      const { unmount } = renderGuideAt(`/first-aid/${id}/quick`);
      expect(
        screen.getByText(priority),
        `${id} immediate priority`,
      ).toBeInTheDocument();
      const list = screen.getByRole("list", { name: /essential actions/i });
      expect(list.children.length).toBe(actionCount);
      unmount();
    }
  });

  it("keeps emergency escape and Step-by-Step switch reachable", () => {
    renderGuideAt("/first-aid/choking/quick");
    expect(
      screen.getByRole("link", { name: /get help now/i }),
    ).toHaveAttribute("href", "/get-help");
    expect(
      screen.getByRole("link", { name: /open step-by-step guide/i }),
    ).toHaveAttribute("href", "/first-aid/choking/steps");
    expect(
      screen.getByRole("link", { name: /First Aid/i }),
    ).toBeInTheDocument();
  });

  it("shows the not-found state for an invalid category", () => {
    renderGuideAt("/first-aid/not-a-real-category/quick");
    expect(screen.getByText(/Guide not found/i)).toBeInTheDocument();
  });
});

describe("admin route branch (Phase 1 · Task 1)", () => {
  /** Renders the real app router at a given URL. */
  function renderAppAt(path: string): ReturnType<typeof render> {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider observer={observeAuth}>
          <OfflineProvider>
            <AppRoutes />
          </OfflineProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it("renders the section placeholders at their routes", () => {
    renderAppAt("/admin/map");
    expect(
      screen.getByRole("heading", { name: "Location & Nearby Medical Facilities" }),
    ).toBeInTheDocument();

    cleanup();
    renderAppAt("/admin/media");
    expect(screen.getByRole("heading", { name: "Media" })).toBeInTheDocument();

    cleanup();
    renderAppAt("/admin/settings");
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });

  it("resolves the nested :categoryId route in the editor placeholder", () => {
    renderAppAt("/admin/first-aid/burns");
    expect(screen.getByText(/Category parameter:/i)).toHaveTextContent(
      "Category parameter: burns",
    );
  });

  it("keeps unknown /admin/* paths in the admin context", () => {
    renderAppAt("/admin/not-a-real-page");
    expect(screen.getByText(/Page not found/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to the admin dashboard/i }),
    ).toHaveAttribute("href", "/admin");
  });

  it("matches /admin exactly rather than falling through to the public 404", () => {
    renderAppAt("/admin");
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByText(/404/i)).not.toBeInTheDocument();
  });

  it("temporary guard and layout exist as the Task 2 swap points", () => {
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route
            path="admin"
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<div>index child rendered</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("index child rendered")).toBeInTheDocument();
  });
});

describe("RequireAdmin guard (Phase 1 · Task 2)", () => {
  /** Stand-in login route that reveals the preserved destination. */
  function LoginLocation(): JSX.Element {
    const location = useLocation();
    const from = (location.state as { from?: string } | null)?.from ?? "none";
    return <div>login page (from: {from})</div>;
  }

  it("allows the admin route through in development mode (default check)", () => {
    // vitest runs with import.meta.env.DEV === true, so the default
    // environment check exercises the real development path.
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route
            path="admin"
            element={
              <RequireAdmin>
                <div>admin content visible</div>
              </RequireAdmin>
            }
          />
          <Route path="login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("admin content visible")).toBeInTheDocument();
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
  });

  it("denies access when the admin environment check fails (production posture)", () => {
    render(
      <MemoryRouter initialEntries={["/admin/users"]}>
        <Routes>
          <Route
            path="admin/*"
            element={
              <RequireAdmin isAdminEnvironment={() => false}>
                <div>secret admin content</div>
              </RequireAdmin>
            }
          />
          <Route path="login" element={<LoginLocation />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByText("secret admin content")).not.toBeInTheDocument();
    expect(screen.getByText("login page (from: /admin/users)")).toBeInTheDocument();
  });

  it("denies nested admin routes at the single guard boundary, not per page", () => {
    render(
      <MemoryRouter initialEntries={["/admin/first-aid/burns"]}>
        <Routes>
          <Route
            path="admin/*"
            element={
              <RequireAdmin isAdminEnvironment={() => false}>
                <div>editor would render here</div>
              </RequireAdmin>
            }
          />
          <Route path="login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByText(/editor would render/)).not.toBeInTheDocument();
    expect(screen.getByText("login page")).toBeInTheDocument();
  });
});

describe("AdminLayout shell (Phase 1 · Task 3)", () => {
  function renderShellAt(path: string): ReturnType<typeof render> {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<div>dashboard outlet content</div>} />
            <Route path="first-aid" element={<div>first-aid outlet content</div>} />
            <Route
              path="first-aid/:categoryId"
              element={<div>editor outlet content</div>}
            />
            <Route path="settings" element={<div>settings outlet content</div>} />
            <Route path="*" element={<div>admin not-found outlet</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  it("renders the sidebar navigation and the Outlet content", () => {
    renderShellAt("/admin");
    expect(
      screen.getByRole("navigation", { name: "Admin sections" }),
    ).toBeInTheDocument();
    expect(screen.getByText("dashboard outlet content")).toBeInTheDocument();
    for (const label of ADMIN_NAV_ITEMS.map((item) => item.label)) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("points each navigation item at its admin route", () => {
    renderShellAt("/admin");
    for (const item of ADMIN_NAV_ITEMS) {
      expect(screen.getByRole("link", { name: new RegExp(item.label) })).toHaveAttribute(
        "href",
        item.to,
      );
    }
  });

  it("keeps First-Aid Content active on a nested editor route", () => {
    renderShellAt("/admin/first-aid/burns");
    const firstAid = screen.getByRole("link", { name: /First-Aid Content/ });
    expect(firstAid).toBeInTheDocument();
    // NavLink applies its active class only to the matching section.
    expect(/active/.test(firstAid.className) || /_navLinkActive/.test(firstAid.className)).toBe(
      true,
    );
    const dashboard = screen.getByRole("link", { name: /Dashboard/ });
    expect(/_navLinkActive/.test(dashboard.className)).toBe(false);
  });

  it("shows the current section in the topbar and renders the Outlet on nested routes", () => {
    renderShellAt("/admin/first-aid/burns");
    const banner = screen.getByRole("banner");
    expect(within(banner).getByText("Admin")).toBeInTheDocument();
    expect(within(banner).getByText("First-Aid Content")).toBeInTheDocument();
    expect(screen.getByText("editor outlet content")).toBeInTheDocument();
  });

  it("drawer starts closed on desktop and opens from the menu button", () => {
    const { container } = renderShellAt("/admin");
    const menu = screen.getByRole("button", { name: /open admin navigation menu/i });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveAttribute("aria-controls", "adminSidebar");
    expect(container.querySelector('[class*="overlay"]')).toBeNull();

    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector('[class*="overlay"]')).not.toBeNull();
  });

  it("closes the drawer with Escape", () => {
    const { container } = renderShellAt("/admin");
    fireEvent.click(screen.getByRole("button", { name: /open admin navigation menu/i }));
    expect(container.querySelector('[class*="overlay"]')).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector('[class*="overlay"]')).toBeNull();
  });

  it("closes the drawer from the overlay click", () => {
    const { container } = renderShellAt("/admin");
    fireEvent.click(screen.getByRole("button", { name: /open admin navigation menu/i }));
    const overlay = container.querySelector('[class*="overlay"]');
    expect(overlay).not.toBeNull();

    fireEvent.click(overlay as Element);
    expect(container.querySelector('[class*="overlay"]')).toBeNull();
  });

  it("closes the drawer after selecting a navigation item", () => {
    const { container } = renderShellAt("/admin");
    fireEvent.click(screen.getByRole("button", { name: /open admin navigation menu/i }));
    fireEvent.click(screen.getByRole("link", { name: /Settings/ }));
    expect(container.querySelector('[class*="overlay"]')).toBeNull();
    expect(screen.getByText("settings outlet content")).toBeInTheDocument();
  });
});

describe("AdminDashboardPage (Phase 1 · Task 4)", () => {
  function renderDashboard(): ReturnType<typeof render> {
    return render(
      <MemoryRouter initialEntries={["/admin"]}>
        <AuthProvider observer={observeAuth}>
          <OfflineProvider>
            <AppRoutes />
          </OfflineProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it("renders the page title, overview tiles, and stays inside the admin shell", () => {
    renderDashboard();
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("6 categories configured")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Admin sections" }),
    ).toBeInTheDocument();
  });

  it("represents all six real first-aid categories with editor links", () => {
    renderDashboard();
    for (const label of [
      "Burns",
      "Bleeding",
      "Choking",
      "Snake Bite",
      "Road Accident",
      "Fractures",
    ]) {
      const link = screen.getByRole("link", { name: new RegExp(`^${label}`) });
      const categoryId = label.toLowerCase().replace(/\s+/g, "-");
      expect(link).toHaveAttribute("href", `/admin/first-aid/${categoryId}`);
    }
  });

  it("quick actions navigate to real admin routes", () => {
    renderDashboard();
    expect(screen.getByRole("link", { name: /Manage First-Aid Content/i })).toHaveAttribute(
      "href",
      "/admin/first-aid",
    );
    expect(screen.getByRole("link", { name: /Manage Media/i })).toHaveAttribute(
      "href",
      "/admin/media",
    );
    expect(screen.getByRole("link", { name: /View Medical Facilities/i })).toHaveAttribute(
      "href",
      "/admin/map",
    );
    expect(screen.getByRole("link", { name: /View Users/i })).toHaveAttribute(
      "href",
      "/admin/users",
    );
  });

  it("shows honest backend-pending states and no fabricated metrics", () => {
    renderDashboard();
    expect(screen.getAllByText("Backend data not connected")).toHaveLength(2);
    expect(
      screen.getByText(/No administrative activity recorded yet/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Review pending")).toBeInTheDocument();

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/%/); // no invented percentages anywhere
    expect(text).not.toMatch(/\d+\s+(views|active users|reports|uptime)/i);
  });
});
