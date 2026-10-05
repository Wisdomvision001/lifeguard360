import { useState, type JSX } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ImagePicker } from "@/components/ImagePicker";
import { uploadImage } from "@/services/admin/adminMediaService";

vi.mock("@/services/admin/adminMediaService", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, uploadImage: vi.fn() };
});

function Harness({ initial = "" }: { initial?: string }): JSX.Element {
  const [value, setValue] = useState(initial);
  return (
    <ImagePicker
      value={value}
      onChange={setValue}
      folder="images/guides/burns"
      label="Main image"
    />
  );
}

function pickerInput(): HTMLInputElement {
  const input = document.querySelector('[data-testid="file-input-Main image"]');
  if (input === null) throw new Error("picker input not found");
  return input as HTMLInputElement;
}

const PNG = new File(["png-bytes"], "hero.png", { type: "image/png" });

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(uploadImage).mockResolvedValue({
    path: "images/guides/burns/1712-hero.png",
    url: "https://firebasestorage.googleapis.com/v0/b/demo/o/hero?alt=media&token=abc",
  });
});

describe("ImagePicker", () => {
  it("offers the native picker with the accepted image types", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: /^upload image$/i })).toBeInTheDocument();
    expect(pickerInput().accept).toBe("image/png,image/jpeg,image/webp,image/gif");
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("previews a valid selection locally and uploads only after confirmation", async () => {
    render(<Harness />);
    fireEvent.change(pickerInput(), { target: { files: [PNG] } });
    expect(
      await screen.findByAltText("Selected file preview for Main image"),
    ).toBeInTheDocument();
    expect(screen.getByText(/not uploaded yet/i)).toBeInTheDocument();
    expect(uploadImage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /confirm upload/i }));
    expect(await screen.findByText(/Uploaded “hero.png”/)).toBeInTheDocument();
    expect(uploadImage).toHaveBeenCalledWith(PNG, "images/guides/burns");
    // The reference now flows through onChange: preview switches to the value.
    expect(screen.getByAltText("Current image for Main image")).toHaveAttribute(
      "src",
      "https://firebasestorage.googleapis.com/v0/b/demo/o/hero?alt=media&token=abc",
    );
    expect(screen.getByRole("button", { name: /replace image/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove image for main image/i })).toBeInTheDocument();
  });

  it("rejects an invalid file type before any upload", () => {
    render(<Harness />);
    const bad = new File(["# note"], "note.txt", { type: "text/plain" });
    fireEvent.change(pickerInput(), { target: { files: [bad] } });
    expect(screen.getByRole("alert")).toHaveTextContent("not a supported image type");
    expect(screen.queryByAltText(/Selected file preview/)).not.toBeInTheDocument();
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("keeps the existing image when a replacement is abandoned", async () => {
    render(<Harness initial="/images/burns.jpg" />);
    expect(screen.getByAltText("Current image for Main image")).toBeInTheDocument();

    fireEvent.change(pickerInput(), { target: { files: [PNG] } });
    await screen.findByAltText("Selected file preview for Main image");
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    // Back to the untouched current image — nothing uploaded, nothing lost.
    expect(screen.getByAltText("Current image for Main image")).toHaveAttribute(
      "src",
      "/images/burns.jpg",
    );
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("removal clears the reference through onChange", () => {
    render(<Harness initial="/images/burns.jpg" />);
    fireEvent.click(screen.getByRole("button", { name: /remove image for main image/i }));
    expect(screen.queryByAltText(/Current image/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^upload image$/i })).toBeInTheDocument();
  });

  it("reports an upload failure honestly and allows a retry", async () => {
    vi.mocked(uploadImage)
      .mockRejectedValueOnce(new Error("The service is temporarily unavailable."))
      .mockResolvedValueOnce({
        path: "images/guides/burns/1712-hero.png",
        url: "https://firebasestorage.googleapis.com/v0/b/demo/o/hero2?alt=media&token=new",
      });
    render(<Harness initial="/images/burns.jpg" />);
    fireEvent.change(pickerInput(), { target: { files: [PNG] } });
    fireEvent.click(await screen.findByRole("button", { name: /confirm upload/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The service is temporarily unavailable.",
    );
    // The retry keeps the selection — nothing was cleared by the failure.
    expect(screen.getByRole("button", { name: /confirm upload/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /confirm upload/i }));
    expect(await screen.findByText(/Uploaded “hero.png”/)).toBeInTheDocument();
    expect(uploadImage).toHaveBeenCalledTimes(2);
  });
});
