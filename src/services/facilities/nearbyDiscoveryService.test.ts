import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FacilityWithDistance } from "@/types";
import type { FacilityDiscoveryProvider } from "./nearbyDiscoveryContracts";
import { withDistanceFrom, validateNearbyQuery, buildNearbyFacilityId, NearbyDiscoveryError } from "./nearbyDiscoveryContracts";
import {
  adaptVerifiedFacilities,
  dedupeNearbyResults,
  normalizeDynamicCandidate,
  searchNearbyFacilities,
  StaticTestProvider,
} from "./nearbyDiscoveryService";

// ---- Firestore (existing trusted path) mock --------------------------------

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

function seedVerified(id: string, name: string, latitude: number, longitude: number): void {
  mockDocs.push({
    id,
    data: () => ({
      name,
      category: "hospital",
      coordinates: { latitude, longitude },
      verified: true,
      source: "Test registry (example.org), verified 2026-09-10",
      updatedAt: "2026-09-14T00:00:00Z",
      address: "Abuja Road, Yola, Adamawa State, Nigeria",
      phone: "+2348012345678",
      openingHours: "24/7",
    }),
  });
}

const FROM = { latitude: 9.2345, longitude: 12.4567 };

function baseQuery(radiusMeters = 10_000) {
  return { coordinates: FROM, radiusMeters };
}

function verifiedSeed(): void {
  seedVerified("verified-1", "Yola General Hospital", 9.21, 12.47);
  seedVerified("verified-2", "Jimeta Clinic", 9.25, 12.49);
}

beforeEach(() => {
  mockDocs.length = 0;
});

function makeDynamic(overrides: Partial<Parameters<typeof normalizeDynamicCandidate>[0]> = {}): Parameters<typeof normalizeDynamicCandidate>[0] {
  return {
    id: "osm-node-1000",
    name: "Dynamic OSM Clinic",
    coordinates: { latitude: 9.22, longitude: 12.46 },
    category: "clinic",
    source: { id: "dynamic-provider", label: "test-provider" },
    trust: "dynamic",
    distanceMeters: -1, // provider-supplied garbage — must be discarded
    ...overrides,
  };
}

describe("request validation (deterministic first violation)", () => {
  it("accepts a valid request shape", () => {
    expect(validateNearbyQuery(baseQuery())).toBeNull();
  });

  it("rejects invalid latitude with invalid-coordinates", () => {
    expect(validateNearbyQuery({ coordinates: { latitude: 95, longitude: 12.4567 }, radiusMeters: 10_000 })).toBe("invalid-coordinates");
    expect(validateNearbyQuery({ coordinates: { latitude: Number.NaN, longitude: 12.4567 }, radiusMeters: 10_000 })).toBe("invalid-coordinates");
  });

  it("rejects invalid longitude with invalid-coordinates", () => {
    expect(validateNearbyQuery({ coordinates: { latitude: 9.2345, longitude: 200 }, radiusMeters: 10_000 })).toBe("invalid-coordinates");
  });

  it("rejects invalid radius with invalid-radius (min 100, max 50 000)", () => {
    expect(validateNearbyQuery({ coordinates: FROM, radiusMeters: 99 })).toBe("invalid-radius");
    expect(validateNearbyQuery({ coordinates: FROM, radiusMeters: 50_001 })).toBe("invalid-radius");
    expect(validateNearbyQuery({ coordinates: FROM, radiusMeters: Number.POSITIVE_INFINITY })).toBe("invalid-radius");
  });

  it("coordinates violations take precedence over radius violations", () => {
    expect(validateNearbyQuery({ coordinates: { latitude: 95, longitude: 200 }, radiusMeters: 1 })).toBe("invalid-coordinates");
  });

  it("searchNearbyFacilities throws a normalized error for invalid input before any source is touched", async () => {
    await expect(searchNearbyFacilities({ coordinates: { latitude: 95, longitude: 0 }, radiusMeters: 10_000 })).rejects.toMatchObject({ code: "invalid-coordinates" });
    await expect(searchNearbyFacilities({ coordinates: FROM, radiusMeters: 5 })).rejects.toMatchObject({ code: "invalid-radius" });
  });
});

describe("trust rule (architectural, test-pinned)", () => {
  it("dynamic provider results always receive trust 'dynamic' — even if the provider claimed otherwise", async () => {
    verifiedSeed();
    const provider = new StaticTestProvider([makeDynamic({ trust: "verified" as never })]);
    const result = await searchNearbyFacilities(baseQuery(), provider);
    const dynamic = result.facilities.filter((f) => f.source.id === "dynamic-provider");
    expect(dynamic.length).toBeGreaterThan(0);
    for (const facility of dynamic) expect(facility.trust).toBe("dynamic");
  });

  it("dynamic results carry the dynamic-provider source id", async () => {
    verifiedSeed();
    const provider = new StaticTestProvider([makeDynamic()]);
    const result = await searchNearbyFacilities(baseQuery(), provider);
    expect(result.facilities.some((f) => f.source.id === "dynamic-provider")).toBe(true);
    expect(result.sources.map((s) => s.id)).toContain("dynamic-provider");
  });

  it("verified and dynamic facilities remain distinguishable in combined results", async () => {
    verifiedSeed();
    const provider = new StaticTestProvider([makeDynamic()]);
    const result = await searchNearbyFacilities(baseQuery(), provider);
    const verified = result.facilities.filter((f) => f.trust === "verified");
    const dynamic = result.facilities.filter((f) => f.trust === "dynamic");
    expect(verified.length).toBe(2);
    expect(dynamic.length).toBe(1);
    expect(verified.every((f) => f.source.id === "lifeguard360")).toBe(true);
  });

  it("verified-only search works when no provider is supplied", async () => {
    verifiedSeed();
    const result = await searchNearbyFacilities(baseQuery());
    expect(result.facilities).toHaveLength(2);
    expect(result.facilities.every((f) => f.trust === "verified")).toBe(true);
    expect(result.diagnostics.errorsBySource).toBeUndefined();
    expect(result.note).toBeNull();
  });
});

describe("error normalization", () => {
  it("provider failure becomes a normalized code while verified results survive", async () => {
    verifiedSeed();
    const failing: FacilityDiscoveryProvider = {
      providerId: "failing-provider",
      searchNearby: async () => {
        throw new Error("ECONNRESET timeout https://secrets.example.com/key=ABC");
      },
    };
    const result = await searchNearbyFacilities(baseQuery(), failing);
    expect(result.facilities.filter((f) => f.trust === "verified")).toHaveLength(2);
    expect(result.diagnostics.errorsBySource?.["failing-provider"]).toBe("unexpected-provider-failure");
    expect(result.note).toMatch(/temporarily unavailable/i);
  });

  it("raw provider error details are never exposed in the result", async () => {
    verifiedSeed();
    const secret = "sk-live-NEVER-EXPOSE-123";
    const failing: FacilityDiscoveryProvider = {
      providerId: "leaky-provider",
      searchNearby: async () => {
        throw new NearbyDiscoveryError("provider-rate-limited", `quota exceeded for ${secret}`);
      },
    };
    const result = await searchNearbyFacilities(baseQuery(), failing);
    expect(result.diagnostics.errorsBySource?.["leaky-provider"]).toBe("provider-rate-limited");
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.note).not.toContain(secret);
  });

  it("a NearbyDiscoveryError from a provider keeps its specific code", async () => {
    verifiedSeed();
    const failing: FacilityDiscoveryProvider = {
      providerId: "timeout-provider",
      searchNearby: async () => {
        throw new NearbyDiscoveryError("provider-timeout", "timed out");
      },
    };
    const result = await searchNearbyFacilities(baseQuery(), failing);
    expect(result.diagnostics.errorsBySource?.["timeout-provider"]).toBe("provider-timeout");
  });

  it("a non-array provider response is a malformed-response error, not a crash", async () => {
    verifiedSeed();
    const bad: FacilityDiscoveryProvider = {
      providerId: "shapeless-provider",
      searchNearby: (async () => ({ items: [] })) as unknown as FacilityDiscoveryProvider["searchNearby"],
    };
    const result = await searchNearbyFacilities(baseQuery(), bad);
    expect(result.diagnostics.errorsBySource?.["shapeless-provider"]).toBe("provider-malformed-response");
  });

  it("Firestore unavailability normalizes to provider-unavailable", async () => {
    const { isFirebaseConfigured } = await import("@/services/firebase/client");
    vi.mocked(isFirebaseConfigured).mockReturnValue(false);
    const result = await searchNearbyFacilities(baseQuery());
    expect(result.diagnostics.errorsBySource?.["lifeguard360"]).toBe("provider-unavailable");
    expect(result.facilities).toHaveLength(0);
    expect(result.note).toMatch(/verified facility data is currently unavailable/i);
    vi.mocked(isFirebaseConfigured).mockReturnValue(true);
  });
});

describe("distance and sorting", () => {
  it("distance is computed by Lifeguard360 — provider-supplied distance is discarded", async () => {
    verifiedSeed();
    const provider = new StaticTestProvider([makeDynamic({ distanceMeters: 123_456 })]);
    const result = await searchNearbyFacilities(baseQuery(), provider);
    const dynamic = result.facilities.find((f) => f.source.id === "dynamic-provider");
    expect(dynamic?.distanceMeters).not.toBe(123_456);
    expect(dynamic?.distanceMeters).toBeGreaterThan(0);
    expect(dynamic?.distanceMeters).toBeLessThan(10_000);
  });

  it("distance helper operates independently of any provider", () => {
    const facility = makeDynamic();
    const stamped = withDistanceFrom({ ...facility, trust: "dynamic", distanceMeters: Number.NaN }, FROM);
    expect(stamped.distanceMeters).toBeGreaterThan(0);
    const expected = withDistanceFrom({ ...facility, trust: "dynamic", distanceMeters: Number.NaN }, FROM).distanceMeters;
    expect(expected).toBe(stamped.distanceMeters); // deterministic
  });

  it("combined results are sorted nearest-first", async () => {
    verifiedSeed();
    const provider = new StaticTestProvider([
      makeDynamic({ coordinates: { latitude: 9.235, longitude: 12.457 } }), // very close
    ]);
    const result = await searchNearbyFacilities(baseQuery(), provider);
    const distances = result.facilities.map((f) => f.distanceMeters);
    const sorted = [...distances].sort((a, b) => a - b);
    expect(distances).toEqual(sorted);
    expect(result.facilities[0]?.trust).toBe("dynamic"); // the close one is dynamic
  });
});

describe("adapter and seam units", () => {
  it("adaptVerifiedFacilities maps the trusted shape into the normalized model", () => {
    const trusted: FacilityWithDistance = {
      id: "doc-1",
      name: "A Hospital",
      category: "hospital",
      coordinates: { latitude: 9.2, longitude: 12.4 },
      verified: true,
      source: "registry",
      updatedAt: "2026-09-14T00:00:00Z",
      distanceMeters: 500,
    };
    const adapted = adaptVerifiedFacilities([trusted]);
    expect(adapted[0]).toMatchObject({ id: "doc-1", trust: "verified", distanceMeters: 500 });
    expect(adapted[0]?.source.id).toBe("lifeguard360");
  });

  it("normalizeDynamicCandidate stamps trust/source and rebuilds the id from external identity", () => {
    const normalized = normalizeDynamicCandidate(makeDynamic({ externalId: "way/55" }), FROM, { id: "dynamic-provider", label: "test" });
    expect(normalized.trust).toBe("dynamic");
    expect(normalized.source.id).toBe("dynamic-provider");
    expect(normalized.id).toBe("dynamic-provider:way/55");
    expect(Number.isFinite(normalized.distanceMeters)).toBe(true);
  });

  it("buildNearbyFacilityId is stable and source-scoped", () => {
    expect(buildNearbyFacilityId("dynamic-provider", "node/1")).toBe("dynamic-provider:node/1");
    expect(buildNearbyFacilityId("lifeguard360", "node/1")).toBe("lifeguard360:node/1");
  });

  it("dedupeNearbyResults is currently an identity seam (no dedup yet)", () => {
    const list = [makeDynamic(), makeDynamic()];
    const out = dedupeNearbyResults(list as never);
    expect(out).toHaveLength(2);
  });
});

describe("no-results and payload hygiene", () => {
  it("no results is a successful empty response with a source-note", async () => {
    // Firestore configured but the verified collection returns nothing usable.
    mockDocs.push({ id: "draft", data: () => ({ verified: false }) });
    const result = await searchNearbyFacilities(baseQuery());
    expect(result.facilities).toEqual([]);
    expect(result.note).toMatch(/no verified/i);
  });

  it("result contains no raw provider payload fields", async () => {
    verifiedSeed();
    const provider = new StaticTestProvider([makeDynamic()]);
    const result = await searchNearbyFacilities(baseQuery(), provider);
    const serialized = JSON.stringify(result);
    for (const forbidden of ["raw", "payload", "response", "html", "json"]) {
      expect(serialized).not.toContain(`"${forbidden}":`);
    }
  });
});
