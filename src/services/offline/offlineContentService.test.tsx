import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { OfflineProvider, useOffline } from "@/app/providers/OfflineProvider";
import {
  getOfflinePackageMeta,
  removeOfflinePackage,
  saveOfflinePackage,
} from "@/services/offline/offlineContentService";
import { CONTENT_VERSION } from "@/data/firstAid";
import type { EmergencyCategoryId } from "@/types";

describe("offlineContentService", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reports absence honestly before any download", () => {
    expect(getOfflinePackageMeta()).toBeNull();
  });

  it("round-trips a saved package with version and categories", () => {
    const categories: EmergencyCategoryId[] = ["burns", "bleeding"];
    const meta = saveOfflinePackage(categories, CONTENT_VERSION);
    expect(meta.version).toBe(CONTENT_VERSION);
    expect(meta.categories).toEqual(categories);
    expect(getOfflinePackageMeta()?.categories).toEqual(["burns", "bleeding"]);
  });

  it("removes the package completely", () => {
    saveOfflinePackage(["burns"], CONTENT_VERSION);
    removeOfflinePackage();
    expect(getOfflinePackageMeta()).toBeNull();
  });

  it("tolerates corrupt stored data by returning null", () => {
    window.localStorage.setItem("lifeguard360.offlinePackage.v1", "{not json");
    expect(getOfflinePackageMeta()).toBeNull();
  });
});

/**
 * Renders the provider value into the DOM so assertions observe real output
 * without reaching into module globals.
 */
function OfflineProbe() {
  const { online, meta, updateAvailable, refreshMeta, clearPackage } = useOffline();
  return (
    <div>
      <span data-testid="online">{String(online)}</span>
      <span data-testid="meta">{meta === null ? "none" : meta.version}</span>
      <span data-testid="update">{String(updateAvailable)}</span>
      <button type="button" onClick={refreshMeta}>
        refresh
      </button>
      <button type="button" onClick={clearPackage}>
        clear
      </button>
    </div>
  );
}

function renderProbe() {
  render(
    <MemoryRouter>
      <OfflineProvider>
        <OfflineProbe />
      </OfflineProvider>
    </MemoryRouter>,
  );
}

describe("OfflineProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    cleanup();
  });

  it("starts with no package and no update available", () => {
    renderProbe();
    expect(screen.getByTestId("meta").textContent).toBe("none");
    expect(screen.getByTestId("update").textContent).toBe("false");
  });

  it("flags update available when the stored version is stale", () => {
    saveOfflinePackage(["burns"], "0.0.1-old");
    renderProbe();
    expect(screen.getByTestId("meta").textContent).toBe("0.0.1-old");
    expect(screen.getByTestId("update").textContent).toBe("true");
  });

  it("sees a current-version package as up to date", () => {
    saveOfflinePackage(["burns"], CONTENT_VERSION);
    renderProbe();
    expect(screen.getByTestId("update").textContent).toBe("false");
  });

  it("clearPackage removes the stored package and resets state", () => {
    saveOfflinePackage(["burns"], CONTENT_VERSION);
    renderProbe();
    fireEvent.click(screen.getByRole("button", { name: "clear" }));
    expect(getOfflinePackageMeta()).toBeNull();
    expect(screen.getByTestId("meta").textContent).toBe("none");
  });
});
