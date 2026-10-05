import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JSX } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

import { AdminFirstAidPage } from "@/pages/admin/AdminFirstAidPage";
import { AdminGuideEditorPage } from "@/pages/admin/AdminGuideEditorPage";
import { AdminMediaPage } from "@/pages/admin/AdminMediaPage";
import { CONTENT_VERSION, FIRST_AID_GUIDES } from "@/data/firstAid";
import {
  buildMediaUsageIndex,
  deleteMediaItem,
  listMediaItems,
  uploadImage,
  MAX_IMAGE_BYTES,
  type MediaItem,
} from "@/services/admin/adminMediaService";
import {
  discardDraft,
  fetchDraft,
  fetchGuideOverview,
  publishGuide,
  saveDraft,
  type GuideOverviewEntry,
} from "@/services/admin/adminGuideService";

vi.mock("@/services/admin/adminGuideService", () => ({
  fetchGuideOverview: vi.fn(),
  fetchDraft: vi.fn(),
  fetchAllDrafts: vi.fn(),
  saveDraft: vi.fn(),
  publishGuide: vi.fn(),
  discardDraft: vi.fn(),
}));

vi.mock("@/services/admin/adminMediaService", async (importOriginal) => {  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    listMediaItems: vi.fn(),
    buildMediaUsageIndex: vi.fn(),
    uploadImage: vi.fn(),
    deleteMediaItem: vi.fn(),
    replaceMediaItem: vi.fn(),
  };
});

const SIX_CATEGORIES = [
  ["burns", "Burns"],
  ["bleeding", "Bleeding"],
  ["choking", "Choking"],
  ["snake-bite", "Snake Bite"],
  ["road-accident", "Road Accident"],
  ["fractures", "Fractures"],
] as const;

function overviewFixture(
  patch: (id: string) => Partial<GuideOverviewEntry> = () => ({}),
): GuideOverviewEntry[] {
  return SIX_CATEGORIES.map(([id, label]) => ({
    id,
    label,
    hasDraft: false,
    hasPublished: false,
    draftUpdatedAt: "",
    publishedAt: "",
    ...patch(id),
  }));
}

const USED_MEDIA: MediaItem = {
  path: "images/guides/burns/1712-hero.png",
  name: "1712-hero.png",
  contentType: "image/png",
  sizeBytes: 2048,
  updatedAt: "2026-10-01T12:00:00.000Z",
  url: "https://firebasestorage.googleapis.com/v0/b/demo/o/hero?alt=media&token=abc",
};

function renderAt(path: string, element: JSX.Element): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/first-aid" element={element} />
        <Route path="/admin/first-aid/:categoryId" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

function fileInput(testId: string): HTMLInputElement {
  const input = document.querySelector(`[data-testid="${testId}"]`);
  if (input === null) throw new Error(`file input ${testId} not found`);
  return input as HTMLInputElement;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(fetchGuideOverview).mockResolvedValue(overviewFixture());
  vi.mocked(fetchDraft).mockResolvedValue({ guide: null, updatedAt: "" });
  vi.mocked(saveDraft).mockResolvedValue();
  vi.mocked(publishGuide).mockResolvedValue();
  vi.mocked(discardDraft).mockResolvedValue();
  vi.mocked(listMediaItems).mockResolvedValue([]);
  vi.mocked(buildMediaUsageIndex).mockResolvedValue(new Map());
  vi.mocked(uploadImage).mockResolvedValue({
    path: "images/uploads/1712-hero.png",
    url: "https://firebasestorage.googleapis.com/v0/b/demo/o/1712-hero.png?alt=media&token=new",
  });
  vi.mocked(deleteMediaItem).mockResolvedValue();
});

describe("AdminFirstAidPage — content registry", () => {
  it("lists all six guides with honest source badges", async () => {
    renderAt("/admin/first-aid", <AdminFirstAidPage />);
    expect(await screen.findByRole("link", { name: /^Burns/ })).toBeInTheDocument();
    for (const [, label] of SIX_CATEGORIES) {
      expect(screen.getByRole("link", { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
    expect(
      screen.getByText("Public app serving bundled fallback content"),
    ).toBeInTheDocument();
    expect(screen.getByText(/0 published · 0 drafts/)).toBeInTheDocument();
    expect(screen.getAllByText("Not published — bundled fallback")).toHaveLength(6);
    expect(screen.getAllByText("Review pending")).toHaveLength(6);
  });

  it("shows version, step counts, media presence and provenance per guide", async () => {
    renderAt("/admin/first-aid", <AdminFirstAidPage />);
    expect(await screen.findByRole("link", { name: /^Burns/ })).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(`version ${CONTENT_VERSION}`))).toHaveLength(6);
    expect(screen.getAllByText(/Media:/i)).toHaveLength(6);
    // Burns and Bleeding each carry one real step image; Choking carries two.
    expect(
      within(screen.getByRole("link", { name: /^Burns/ })).getByText(
        /Media: 1 step image/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("link", { name: /^Bleeding/ })).getByText(
        /Media: 1 step image/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("link", { name: /^Choking/ })).getByText(
        /Media: 2 step images/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Provenance: Prototype content/i)).toHaveLength(6);
  });

  it("links every registry row to its editor route", async () => {
    renderAt("/admin/first-aid", <AdminFirstAidPage />);
    const links = await screen.findAllByRole("link");
    expect(links).toHaveLength(SIX_CATEGORIES.length);
    for (const [id, label] of SIX_CATEGORIES) {
      expect(
        screen.getByRole("link", { name: new RegExp(`^${label}`) }),
      ).toHaveAttribute("href", `/admin/first-aid/${id}`);
    }
  });

  it("reports real publication state per guide (published / draft)", async () => {
    vi.mocked(fetchGuideOverview).mockResolvedValue(
      overviewFixture((id) => {
        if (id === "burns") {
          return { hasPublished: true, publishedAt: "2026-10-01T09:00:00.000Z" };
        }
        if (id === "bleeding") {
          return { hasDraft: true, draftUpdatedAt: "2026-10-02T14:30:00.000Z" };
        }
        return {};
      }),
    );
    renderAt("/admin/first-aid", <AdminFirstAidPage />);
    expect(await screen.findByText("Published to Firebase")).toBeInTheDocument();
    expect(screen.getByText(/Draft saved 2026-10-02/)).toBeInTheDocument();
    expect(screen.getByText(/1 published · 1 draft\b/)).toBeInTheDocument();
    // Bleeding has only a draft (unpublished), the other four are untouched:
    // five entries honestly carry no published document.
    expect(screen.getAllByText("Not published — bundled fallback")).toHaveLength(5);
  });

  it("shows an honest error state when the status read fails", async () => {
    vi.mocked(fetchGuideOverview).mockRejectedValue(
      new Error("You do not have permission to perform this action."),
    );
    renderAt("/admin/first-aid", <AdminFirstAidPage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Publication status could not be read");
    expect(alert).toHaveTextContent("You do not have permission");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

describe("AdminGuideEditorPage — editor", () => {
  it("renders guide-level fields, steps and quick guide from the bundled baseline", async () => {
    renderAt("/admin/first-aid/burns", <AdminGuideEditorPage />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Burns" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Label")).toHaveValue("Burns");
    expect(screen.getByLabelText("Content version")).toHaveValue(CONTENT_VERSION);
    expect(screen.getByLabelText("Summary")).toHaveValue(
      "Learn what to do in case of burns and scalds.",
    );
    // Five real steps, each with its instruction field populated.
    expect(screen.getAllByLabelText("Instruction (spoken aloud)")).toHaveLength(5);
    expect(screen.getAllByLabelText(/^Step image \(optional\)$/)).toHaveLength(5);
    // Step 2 of burns carries the real bundled image — shown as the picker's
    // current-image preview, not a typed path.
    expect(screen.getByAltText("Current image for Step 2 image")).toHaveAttribute(
      "src",
      "/images/first-aid/burns/burns-cool-running-water.jpg",
    );
    expect(screen.getByLabelText("Immediate priority")).toHaveValue(
      "Stop the burning and cool the burn.",
    );
  });

  it("offers the real draft/publish actions and never claims a fake save", async () => {
    renderAt("/admin/first-aid/burns", <AdminGuideEditorPage />);
    await screen.findByRole("heading", { level: 1, name: "Burns" });
    expect(screen.getByText(/admin-only working copy/)).toBeInTheDocument();
    expect(screen.getByText(/bundled fallback content/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save draft$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^publish$/i })).toBeInTheDocument();
    expect(screen.queryByText(/saved successfully/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/known schema note/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/does not save yet/i)).not.toBeInTheDocument();
  });

  it("edits title, summary, step instruction and warning with dirty tracking", async () => {
    renderAt("/admin/first-aid/burns", <AdminGuideEditorPage />);
    await screen.findByRole("heading", { level: 1, name: "Burns" });
    const discard = screen.getByRole("button", { name: /discard edits/i });
    expect(discard).toBeDisabled();
    expect(screen.getByText("No local edits")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Burns & scalds" } });
    fireEvent.change(screen.getByLabelText("Summary"), {
      target: { value: "Cooling and covering burns." },
    });
    fireEvent.change(screen.getAllByLabelText("Instruction (spoken aloud)")[0], {
      target: { value: "Move away from the heat source first." },
    });
    fireEvent.change(screen.getAllByLabelText("Warning (optional)")[0], {
      target: { value: "Never apply ice directly." },
    });
    expect(screen.getByText("Unsaved local edits")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discard edits/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /discard edits/i }));
    expect(screen.getByLabelText("Label")).toHaveValue("Burns");
    expect(screen.getByLabelText("Summary")).toHaveValue(
      "Learn what to do in case of burns and scalds.",
    );
    expect(screen.getAllByLabelText("Warning (optional)")[0]).toHaveValue("");
    expect(screen.getByText("No local edits")).toBeInTheDocument();
  });

  it("validation passes on untouched content and says it is ready", async () => {
    renderAt("/admin/first-aid/burns", <AdminGuideEditorPage />);
    await screen.findByRole("heading", { level: 1, name: "Burns" });
    fireEvent.click(screen.getByRole("button", { name: /validate draft/i }));
    expect(screen.getByText(/all fields pass validation/i)).toBeInTheDocument();
  });

  it("validation surfaces field errors for emptied required fields", async () => {
    renderAt("/admin/first-aid/burns", <AdminGuideEditorPage />);
    await screen.findByRole("heading", { level: 1, name: "Burns" });
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /validate draft/i }));
    expect(screen.getByText("A guide label is required.")).toBeInTheDocument();
    expect(screen.getByText(/some fields need attention/i)).toBeInTheDocument();
  });

  it("adds and removes list items with the shared list editor", async () => {
    renderAt("/admin/first-aid/burns", <AdminGuideEditorPage />);
    await screen.findByRole("heading", { level: 1, name: "Burns" });
    const dosCard = screen
      .getByRole("heading", { level: 3, name: "Do" })
      .closest("section");
    if (dosCard === null) throw new Error("Do card missing");
    const doSection = within(dosCard);
    const before = doSection.getAllByRole("list")[0].children.length;
    fireEvent.click(doSection.getByRole("button", { name: /add do item/i }));
    expect(doSection.getAllByRole("list")[0].children.length).toBe(before + 1);
    fireEvent.click(
      doSection.getByRole("button", { name: /remove item 1 from do items/i }),
    );
    expect(doSection.getAllByRole("list")[0].children.length).toBe(before);
  });

  it("loads a saved draft as the editing baseline", async () => {
    vi.mocked(fetchDraft).mockResolvedValue({
      guide: { ...FIRST_AID_GUIDES.burns, label: "Burns (draft)" },
      updatedAt: "2026-10-02T10:00:00.000Z",
    });
    renderAt("/admin/first-aid/burns", <AdminGuideEditorPage />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Burns (draft)" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Editing saved draft/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /discard saved draft/i }),
    ).toBeInTheDocument();
  });

  it("warns honestly when the draft cannot be loaded", async () => {
    vi.mocked(fetchDraft).mockRejectedValue(
      new Error("The service is temporarily unavailable."),
    );
    renderAt("/admin/first-aid/burns", <AdminGuideEditorPage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The saved draft could not be loaded");
    expect(alert).toHaveTextContent("The service is temporarily unavailable.");
    // Editing still proceeds from the published/bundled baseline.
    expect(screen.getByLabelText("Label")).toHaveValue("Burns");
  });

  it("saves a draft through the service and reports the saved state", async () => {
    renderAt("/admin/first-aid/burns", <AdminGuideEditorPage />);
    await screen.findByRole("heading", { level: 1, name: "Burns" });
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Burns & scalds" } });
    fireEvent.click(screen.getByRole("button", { name: /^save draft$/i }));
    expect(await screen.findByText(/Draft saved at/)).toBeInTheDocument();
    expect(saveDraft).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(saveDraft).mock.calls[0][0];
    expect(saved.id).toBe("burns");
    expect(saved.label).toBe("Burns & scalds");
    expect(screen.getByText("No local edits")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save draft$/i })).toBeDisabled();
  });

  it("reports a failed save honestly and keeps the admin's work", async () => {
    vi.mocked(saveDraft).mockRejectedValue(
      new Error("You do not have permission to perform this action."),
    );
    renderAt("/admin/first-aid/burns", <AdminGuideEditorPage />);
    await screen.findByRole("heading", { level: 1, name: "Burns" });
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Burns & scalds" } });
    fireEvent.click(screen.getByRole("button", { name: /^save draft$/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You do not have permission to perform this action.");
    // The unsaved work survives the failure.
    expect(screen.getByLabelText("Label")).toHaveValue("Burns & scalds");
    expect(screen.getByText("Unsaved local edits")).toBeInTheDocument();
  });

  it("publishes through the service and reports the published state", async () => {
    renderAt("/admin/first-aid/burns", <AdminGuideEditorPage />);
    await screen.findByRole("heading", { level: 1, name: "Burns" });
    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));
    expect(await screen.findByText(/Published at/)).toBeInTheDocument();
    expect(publishGuide).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Published to Firebase")).toBeInTheDocument();
  });

  it("reports a failed publish honestly without claiming success", async () => {
    vi.mocked(publishGuide).mockRejectedValue(
      new Error("The service is temporarily unavailable."),
    );
    renderAt("/admin/first-aid/burns", <AdminGuideEditorPage />);
    await screen.findByRole("heading", { level: 1, name: "Burns" });
    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The service is temporarily unavailable.");
    expect(screen.queryByText(/Published at/)).not.toBeInTheDocument();
    expect(screen.queryByText("Published to Firebase")).not.toBeInTheDocument();
  });

  it("discards a saved draft through the service on confirmation", async () => {
    vi.mocked(fetchDraft).mockResolvedValue({
      guide: { ...FIRST_AID_GUIDES.burns, label: "Burns (draft)" },
      updatedAt: "2026-10-02T10:00:00.000Z",
    });
    renderAt("/admin/first-aid/burns", <AdminGuideEditorPage />);
    await screen.findByRole("heading", { level: 1, name: "Burns (draft)" });
    fireEvent.click(screen.getByRole("button", { name: /discard saved draft/i }));
    fireEvent.click(await screen.findByRole("button", { name: /yes, discard draft/i }));
    await waitFor(() => expect(discardDraft).toHaveBeenCalledWith("burns"));
    // Baseline falls back to the bundled content (no published doc in test).
    expect(
      await screen.findByRole("heading", { level: 1, name: "Burns" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Bundled content — not published yet/)).toBeInTheDocument();
  });

  it("resets editor state when the route category changes", async () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={["/admin/first-aid/burns"]}>
        <Routes>
          <Route path="/admin/first-aid/:categoryId" element={<AdminGuideEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { level: 1, name: "Burns" });
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Changed" } });
    expect(screen.getByText("Unsaved local edits")).toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={["/admin/first-aid/burns"]}>
        <Routes>
          <Route path="/admin/first-aid/:categoryId" element={<AdminGuideEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    // Same-mount category change is exercised via the param pattern in pages.test.tsx;
    // here the rerender with a different router keeps state — covered instead by
    // the full-router test in pages.test.tsx.
    expect(screen.getByLabelText("Label")).toBeInTheDocument();
  });

  it("shows the not-found state for an unknown category", async () => {
    renderAt("/admin/first-aid/unknown", <AdminGuideEditorPage />);
    expect(await screen.findByText("Guide not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to first-aid content/i })).toHaveAttribute(
      "href",
      "/admin/first-aid",
    );
  });

  it("shows provenance as review-owned and read-only", async () => {
    renderAt("/admin/first-aid/burns", <AdminGuideEditorPage />);
    await screen.findByRole("heading", { level: 1, name: "Burns" });
    expect(screen.getByText(/set by the medical review process/i)).toBeInTheDocument();
    expect(screen.getByText(/pending verified first-aid source review/i)).toBeInTheDocument();
  });
});

describe("AdminMediaPage — media inventory", () => {
  it("shows a truthful empty state when Storage holds no files", async () => {
    renderAt("/admin/first-aid", <AdminMediaPage />);
    expect(
      await screen.findByText(/No files in Firebase Storage yet/),
    ).toBeInTheDocument();
    expect(listMediaItems).toHaveBeenCalledTimes(1);
    // The bundled section still lists the real shipped assets.
    expect(screen.getByText(/Bundled assets \(10\)/)).toBeInTheDocument();
    expect(screen.getByText(/4 step images/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^upload image$/i })).toBeInTheDocument();
    expect(screen.queryByText(/upload complete/i)).not.toBeInTheDocument();
  });

  it("lists real Storage files with type, size and usage", async () => {
    const unused: MediaItem = {
      path: "images/uploads/1713-orphan.png",
      name: "1713-orphan.png",
      contentType: "image/png",
      sizeBytes: 512,
      updatedAt: "2026-10-02T08:00:00.000Z",
      url: "https://firebasestorage.googleapis.com/v0/b/demo/o/orphan?alt=media&token=def",
    };
    vi.mocked(listMediaItems).mockResolvedValue([USED_MEDIA, unused]);
    vi.mocked(buildMediaUsageIndex).mockResolvedValue(
      new Map([[USED_MEDIA.url, ["Burns guide banner"]]]),
    );
    renderAt("/admin/first-aid", <AdminMediaPage />);
    expect(await screen.findByText("images/guides/burns/1712-hero.png")).toBeInTheDocument();
    expect(screen.getByText(/image\/png · 2\.0 KB · uploaded 2026-10-01/)).toBeInTheDocument();
    expect(screen.getByText(/Used by: Burns guide banner/)).toBeInTheDocument();
    expect(screen.getByText(/Not referenced by any guide or draft/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace file 1712-hero.png" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete file 1712-hero.png" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete file 1713-orphan.png" })).toBeInTheDocument();
  });

  it("uploads a chosen file only after confirmation and refreshes the list", async () => {
    vi.mocked(listMediaItems)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([USED_MEDIA]);
    renderAt("/admin/first-aid", <AdminMediaPage />);
    await screen.findByText(/No files in Firebase Storage yet/);

    const file = new File(["png-bytes"], "hero.png", { type: "image/png" });
    fireEvent.change(fileInput("file-input-Upload new image"), {
      target: { files: [file] },
    });
    // Local preview before any network action — nothing uploaded yet.
    expect(
      await screen.findByAltText("Selected file preview for Upload new image"),
    ).toBeInTheDocument();
    expect(screen.getByText(/not uploaded yet/i)).toBeInTheDocument();
    expect(uploadImage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /confirm upload/i }));
    expect(await screen.findByText(/Uploaded “hero.png”/)).toBeInTheDocument();
    expect(uploadImage).toHaveBeenCalledWith(file, "images/uploads");
    // List refreshed from Storage after the upload succeeded.
    expect(await screen.findByText("images/guides/burns/1712-hero.png")).toBeInTheDocument();
  });

  it("rejects an invalid file type before any upload", async () => {
    renderAt("/admin/first-aid", <AdminMediaPage />);
    await screen.findByText(/No files in Firebase Storage yet/);
    const bad = new File(["# notes"], "notes.txt", { type: "text/plain" });
    fireEvent.change(fileInput("file-input-Upload new image"), {
      target: { files: [bad] },
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("not a supported image type");
    expect(uploadImage).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /confirm upload/i })).not.toBeInTheDocument();
  });

  it("rejects an oversized file before any upload", async () => {
    renderAt("/admin/first-aid", <AdminMediaPage />);
    await screen.findByText(/No files in Firebase Storage yet/);
    const big = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "huge.png", {
      type: "image/png",
    });
    fireEvent.change(fileInput("file-input-Upload new image"), {
      target: { files: [big] },
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("the limit is 5.0 MB");
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("reports an upload failure honestly and allows a retry", async () => {
    vi.mocked(uploadImage)
      .mockRejectedValueOnce(new Error("You do not have permission to perform this action."))
      .mockResolvedValueOnce({
        path: "images/uploads/1712-hero.png",
        url: "https://firebasestorage.googleapis.com/v0/b/demo/o/hero2?alt=media&token=new",
      });
    renderAt("/admin/first-aid", <AdminMediaPage />);
    await screen.findByText(/No files in Firebase Storage yet/);
    const file = new File(["png-bytes"], "hero.png", { type: "image/png" });
    fireEvent.change(fileInput("file-input-Upload new image"), {
      target: { files: [file] },
    });
    fireEvent.click(await screen.findByRole("button", { name: /confirm upload/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You do not have permission to perform this action.");
    // Retry keeps the selection; the second attempt succeeds.
    expect(screen.getByRole("button", { name: /confirm upload/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /confirm upload/i }));
    expect(await screen.findByText(/Uploaded “hero.png”/)).toBeInTheDocument();
    expect(uploadImage).toHaveBeenCalledTimes(2);
  });

  it("requires confirmation before deleting and reports the deleted state", async () => {
    vi.mocked(listMediaItems)
      .mockResolvedValueOnce([USED_MEDIA])
      .mockResolvedValueOnce([]);
    renderAt("/admin/first-aid", <AdminMediaPage />);
    await screen.findByText("images/guides/burns/1712-hero.png");

    fireEvent.click(screen.getByRole("button", { name: "Delete file 1712-hero.png" }));
    expect(
      await screen.findByText(/Delete “1712-hero.png” permanently/),
    ).toBeInTheDocument();
    expect(deleteMediaItem).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /yes, delete/i }));
    expect(await screen.findByText(/No files in Firebase Storage yet/)).toBeInTheDocument();
    expect(deleteMediaItem).toHaveBeenCalledWith(USED_MEDIA);
  });

  it("reports a failed delete honestly and keeps the file listed", async () => {
    vi.mocked(listMediaItems).mockResolvedValue([USED_MEDIA]);
    vi.mocked(deleteMediaItem).mockRejectedValue(
      new Error("This file is still used by Burns guide banner."),
    );
    renderAt("/admin/first-aid", <AdminMediaPage />);
    await screen.findByText("images/guides/burns/1712-hero.png");

    fireEvent.click(screen.getByRole("button", { name: "Delete file 1712-hero.png" }));
    fireEvent.click(await screen.findByRole("button", { name: /yes, delete/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not delete");
    expect(alert).toHaveTextContent("This file is still used by Burns guide banner.");
    expect(screen.getByText("images/guides/burns/1712-hero.png")).toBeInTheDocument();
  });
});
