import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- Firestore mock --------------------------------------------------------

type DocData = Record<string, unknown>;

const mockDocs: { data: () => DocData; id: string }[] = [];

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  getDocs: vi.fn(() => Promise.resolve({ docs: mockDocs.map((d) => ({ ...d })) })),
}));

vi.mock("@/services/firebase/client", () => ({
  isFirebaseConfigured: vi.fn(() => true),
  getDb: vi.fn(() => ({ mock: true })),
}));

import {
  facilityDirectionsUrl,
  findNearbyFacilities,
  listVerifiedFacilities,
} from "@/services/facilities/facilityService";
import { isFirebaseConfigured } from "@/services/firebase/client";
import type { Facility } from "@/types";

function seedDoc(id: string, data: DocData): void {
  mockDocs.push({ id, data: () => data });
}

const HOSPITAL = {
  name: "Test General Hospital",
  category: "hospital",
  coordinates: { latitude: 9.21, longitude: 12.47 },
  verified: true,
  source: "Test registry (example.org), verified 2026-09-10",
  updatedAt: "2026-09-14T00:00:00Z",
  phone: "+2348012345678",
  openingHours: "24/7",
  address: "Abuja Road, Yola, Adamawa State, Nigeria",
};

const DRAFT = {
  name: "Draft Unverified Clinic",
  category: "clinic",
  coordinates: { latitude: 9.22, longitude: 12.48 },
  verified: false,
  source: "Draft record",
  updatedAt: "2026-09-14T00:00:00Z",
};

const FROM = { latitude: 9.2345, longitude: 12.4567 };

beforeEach(() => {
  mockDocs.length = 0;
  vi.mocked(isFirebaseConfigured).mockReturnValue(true);
});

describe("listVerifiedFacilities (5D-3 integrity)", () => {
  it("returns only verified records — unverified ones are filtered out", async () => {
    seedDoc("verified-1", HOSPITAL);
    seedDoc("draft-1", DRAFT);

    const facilities = await listVerifiedFacilities();
    expect(facilities.map((f) => f.id)).toEqual(["verified-1"]);
    expect(facilities[0]?.verified).toBe(true);
  });

  it("maps updatedAt from Firestore when present", async () => {
    seedDoc("verified-1", HOSPITAL);
    const facilities = await listVerifiedFacilities();
    expect(facilities[0]?.updatedAt).toBe("2026-09-14T00:00:00Z");
  });

  it("falls back to empty string when updatedAt is absent/malformed", async () => {
    seedDoc("no-timestamp", { ...HOSPITAL, updatedAt: 42 });
    seedDoc("no-field", { ...HOSPITAL, updatedAt: undefined });
    const facilities = await listVerifiedFacilities();
    expect(facilities.every((f) => f.updatedAt === "")).toBe(true);
  });

  it("maps address through when present, omits when absent or malformed", async () => {
    seedDoc("with-addr", HOSPITAL);
    seedDoc("no-addr", { ...HOSPITAL, address: undefined });
    seedDoc("bad-addr", { ...HOSPITAL, address: 123 });
    const facilities = await listVerifiedFacilities();
    expect(facilities.find((f) => f.id === "with-addr")?.address).toBe("Abuja Road, Yola, Adamawa State, Nigeria");
    expect(facilities.find((f) => f.id === "no-addr")?.address).toBeUndefined();
    expect(facilities.find((f) => f.id === "bad-addr")?.address).toBeUndefined();
  });
  it("maps source through for provenance visibility", async () => {
    seedDoc("verified-1", HOSPITAL);
    const facilities = await listVerifiedFacilities();
    expect(facilities[0]?.source).toBe("Test registry (example.org), verified 2026-09-10");
  });

  it("does not crash on malformed documents (defensive mapping preserved)", async () => {
    seedDoc("garbage-1", {});
    seedDoc("garbage-2", { coordinates: "not-an-object", verified: "yes" });
    const facilities = await listVerifiedFacilities();
    // garbage-1 has verified=false (absent) → filtered; garbage-2 verified "yes" (not boolean true) → filtered
    expect(facilities).toHaveLength(0);
  });

  it("throws the honest not-configured error when Firebase is absent", async () => {
    vi.mocked(isFirebaseConfigured).mockReturnValue(false);
    await expect(listVerifiedFacilities()).rejects.toThrow("Firebase is not configured");
  });
});

describe("findNearbyFacilities", () => {
  it("ranks verified facilities by distance and returns firestore source", async () => {
    seedDoc("near", { ...HOSPITAL, coordinates: { latitude: 9.235, longitude: 12.457 } });
    // ~4 km south-west of FROM — well inside the 25 km radius but farther than "near".
    seedDoc("far", { ...HOSPITAL, name: "Far Hospital", coordinates: { latitude: 9.21, longitude: 12.42 } });
    seedDoc("draft", DRAFT);

    const result = await findNearbyFacilities(FROM, 25000);
    expect(result.source).toBe("firestore");
    expect(result.note).toBeNull();
    expect(result.facilities.map((f) => f.name)).toEqual(["Test General Hospital", "Far Hospital"]);
    expect(result.facilities[0]?.distanceMeters ?? Infinity).toBeLessThan(
      result.facilities[1]?.distanceMeters ?? 0,
    );
  });

  it("filters out results beyond the radius", async () => {
    seedDoc("far", { ...HOSPITAL, coordinates: { latitude: 10.5, longitude: 13.5 } });
    const result = await findNearbyFacilities(FROM, 2000);
    expect(result.source).toBe("firestore");
    expect(result.facilities).toHaveLength(0);
    expect(result.note).toContain("No verified facilities were found within the search radius");
  });

  it("reports the honest no-data state when the collection is empty", async () => {
    const result = await findNearbyFacilities(FROM, 10000);
    expect(result.source).toBe("none");
    expect(result.note).toContain("No verified facility data has been published yet");
  });

  it("excludes zero-coordinate sentinels from results", async () => {
    seedDoc("sentinel", { ...HOSPITAL, coordinates: { latitude: 0, longitude: 0 } });
    const result = await findNearbyFacilities(FROM, 10000);
    expect(result.facilities).toHaveLength(0);
  });
});

describe("facilityDirectionsUrl", () => {
  it("builds a Google Maps directions link from a verified facility", () => {
    const verified: Facility = {
      id: "x",
      name: "Test",
      category: "hospital",
      coordinates: { latitude: 9.21, longitude: 12.47 },
      verified: true,
      source: "s",
      updatedAt: "",
    };
    expect(facilityDirectionsUrl(verified)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=9.21,12.47",
    );
  });

  it("needs only coordinates, so discovered facilities share the same directions behaviour", () => {
    // Runtime-discovered records carry no `verified` flag and no dataset id —
    // one directions path serves both sources instead of two divergent ones.
    const url = facilityDirectionsUrl({ coordinates: { latitude: 9.8965, longitude: 8.8583 } });
    expect(url).toBe("https://www.google.com/maps/dir/?api=1&destination=9.8965,8.8583");
  });
});
