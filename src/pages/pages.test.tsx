import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

import { GuidePage } from "@/pages/GuidePage";
import { HomePage } from "@/pages/HomePage";
import { OfflineProvider } from "@/app/providers/OfflineProvider";
import { AuthProvider } from "@/app/providers/AuthProvider";
import { observeAuth } from "@/services/auth/authService";
import { getAllGuides, getGuide, guideToSpeechText } from "@/services/firstAid/firstAidService";

function renderWithProviders(ui: React.ReactElement): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider observer={observeAuth}>
        <OfflineProvider>{ui}</OfflineProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** Renders GuidePage with a real route match so useParams resolves. */
function renderGuideAt(path: string): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider observer={observeAuth}>
        <OfflineProvider>
          <Routes>
            <Route path="/first-aid/:categoryId" element={<GuidePage />} />
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
    expect(text).toContain("Step 1.");
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

describe("GuidePage", () => {
  it("renders steps, dos and don'ts for a valid category", () => {
    renderGuideAt("/first-aid/burns");
    expect(screen.getByRole("heading", { level: 1, name: "Burns" })).toBeInTheDocument();
    expect(screen.getByText("Step-by-step instructions")).toBeInTheDocument();
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
