import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import {
  FirstAidContentProvider,
  useFirstAidContent,
} from "@/app/providers/FirstAidContentProvider";
import { fetchPublishedGuides } from "@/services/firstAid/firstAidBackend";
import { getGuide, resetPublishedGuides } from "@/services/firstAid/firstAidService";
import { isFirebaseConfigured } from "@/services/firebase/client";
import type { FirstAidGuide } from "@/types";

vi.mock("@/services/firstAid/firstAidBackend", () => ({
  fetchPublishedGuides: vi.fn(),
}));

vi.mock("@/services/firebase/client", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, isFirebaseConfigured: vi.fn() };
});

/** Renders the content source plus whatever the merged store serves for burns. */
function Probe(): React.JSX.Element {
  const { source, revision } = useFirstAidContent();
  return (
    <div>
      <span data-testid="source">{source}</span>
      <span data-testid="revision">{String(revision)}</span>
      <span data-testid="burns-label">{getGuide("burns")?.label ?? "missing"}</span>
    </div>
  );
}

const publishedBurns: FirstAidGuide = {
  id: "burns",
  label: "Burns (published)",
  summary: "Published summary.",
  iconClass: "icon-burns",
  content: {
    contentVersion: "2026-10-01",
    summary: "Published summary.",
    steps: [{ title: "Cool", text: "Cool under running water." }],
    dos: ["Cool the burn"],
    donts: ["No ice"],
    whenToSeekHelp: ["Deep burns"],
    quickGuide: {
      immediatePriority: "Cool the burn.",
      essentialActions: ["Cool under water."],
      criticalDonts: ["No ice."],
    },
    provenance: [{ claim: "All", source: "Reviewed", verifiedAt: "2026-10-01" }],
  },
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetPublishedGuides();
  vi.mocked(isFirebaseConfigured).mockReturnValue(true);
});

afterEach(() => {
  resetPublishedGuides();
});

describe("FirstAidContentProvider", () => {
  it("serves the bundled fallback and never fetches when Firebase is unconfigured", () => {
    vi.mocked(isFirebaseConfigured).mockReturnValue(false);
    renderProvider();
    expect(screen.getByTestId("source")).toHaveTextContent("bundled");
    expect(screen.getByTestId("burns-label")).toHaveTextContent("Burns");
    expect(fetchPublishedGuides).not.toHaveBeenCalled();
  });

  it("applies validated published documents over the bundled fallback", async () => {
    vi.mocked(fetchPublishedGuides).mockResolvedValue([publishedBurns]);
    renderProvider();
    expect(await screen.findByText("published")).toBeInTheDocument();
    // The overlay is live for every synchronous consumer.
    expect(screen.getByTestId("burns-label")).toHaveTextContent("Burns (published)");
    // Other categories keep the bundled fallback untouched.
    expect(screen.getByTestId("revision")).toHaveTextContent("1");
  });

  it("keeps the bundled fallback when the fetch fails and never claims published", async () => {
    vi.mocked(fetchPublishedGuides).mockRejectedValue(
      new Error("The service is temporarily unavailable."),
    );
    renderProvider();
    // Give the rejected promise time to settle before asserting the state.
    await vi.waitFor(() => {
      expect(fetchPublishedGuides).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("source")).toHaveTextContent("bundled");
    expect(screen.getByTestId("burns-label")).toHaveTextContent("Burns");
    expect(screen.getByTestId("revision")).toHaveTextContent("0");
  });
});

function renderProvider(): void {
  render(
    <FirstAidContentProvider>
      <Probe />
    </FirstAidContentProvider>,
  );
}
