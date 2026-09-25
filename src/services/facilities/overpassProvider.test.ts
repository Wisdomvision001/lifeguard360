import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NearbyDiscoveryError,
  type NearbyFacilityQuery,
} from "./nearbyDiscoveryContracts";
import {
  OVERPASS_CLIENT_TIMEOUT_MS,
  OVERPASS_ENDPOINT,
  buildOverpassQuery,
  clearOverpassCache,
  createOverpassProvider,
  mapOsmCategory,
  normalizeOsmElement,
} from "./overpassProvider";

/**
 * Overpass provider tests — entirely offline. `fetchFn` is injected so no test
 * ever touches the live Overpass service; the browser integration is verified
 * manually afterwards.
 */

/**
 * Deliberately arbitrary coordinates. Discovery is coordinate-driven and
 * Nigeria-wide: no city, state or region is part of the implementation, and
 * these points exist only so tests can prove the query follows the input.
 */
const POINT_A = { latitude: 9.2398, longitude: 12.4987 };
const POINT_B = { latitude: 9.8965, longitude: 8.8583 };
const POINT_C = { latitude: 5.1234, longitude: 7.9876 };
const POINT_SOUTHERN_HEMISPHERE = { latitude: -33.8688, longitude: 151.2093 };

function query(coordinates = POINT_A, radiusMeters = 3000): NearbyFacilityQuery {
  return { coordinates, radiusMeters };
}

/** A node hospital with a name, a way hospital without one, and a pharmacy. */
function payload(elements: unknown[]): string {
  return JSON.stringify({ version: 0.6, elements });
}

const NODE_HOSPITAL = {
  type: "node",
  id: 4893220623,
  lat: 9.2801823,
  lon: 12.443967,
  tags: { amenity: "hospital", name: "Nassarawo Clinic" },
};

const WAY_WITHOUT_CENTER = {
  type: "way",
  id: 999,
  tags: { amenity: "hospital", name: "Broken Geometry Hospital" },
};

const WAY_HOSPITAL_UNNAMED = {
  type: "way",
  id: 838437237,
  center: { lat: 9.1729759, lon: 12.4809295 },
  tags: { amenity: "hospital", healthcare: "hospital" },
};

const WAY_PHARMACY = {
  type: "way",
  id: 555,
  center: { lat: 9.19, lon: 12.49 },
  tags: { healthcare: "pharmacy", name: "City Pharmacy", "addr:street": "Main Street", "addr:city": "Yola" },
};

interface StubCall {
  url: string;
  init: RequestInit | undefined;
}

function stubFetch(
  handler: (call: StubCall, index: number) => Promise<Response> | Response,
): { calls: StubCall[]; fetchFn: typeof fetch } {
  const calls: StubCall[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init };
    calls.push(call);
    return await handler(call, calls.length - 1);
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  clearOverpassCache();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("query construction (location-driven only)", () => {
  it("builds the around: query from the supplied coordinates and radius", () => {
    const text = buildOverpassQuery(POINT_B, 15_000);
    expect(text).toContain("(around:15000,9.8965,8.8583)");
    expect(text).toContain(`[out:json][timeout:`);
    expect(text).toContain("out center tags");
  });

  it("maps arbitrary coordinate pairs into their own around: clauses (Nigeria-wide, no allowlist)", () => {
    for (const point of [POINT_A, POINT_B, POINT_C, POINT_SOUTHERN_HEMISPHERE]) {
      const text = buildOverpassQuery(point, 4000);
      expect(text).toContain(`(around:4000,${point.latitude},${point.longitude})`);
    }
  });

  it("queries the approved tag union (structured tags, not a free-text match)", () => {
    const text = buildOverpassQuery(POINT_A, 3000);
    for (const statement of [
      'nwr["amenity"="hospital"]',
      'nwr["amenity"="clinic"]',
      'nwr["amenity"="pharmacy"]',
      'nwr["amenity"="doctors"]',
      'nwr["healthcare"]',
    ]) {
      expect(text).toContain(statement);
    }
  });

  it("never hard-codes a city, state or facility name", () => {
    for (const coordinates of [POINT_A, POINT_B, POINT_C, POINT_SOUTHERN_HEMISPHERE]) {
      const text = buildOverpassQuery(coordinates, 5000);
      expect(text).not.toMatch(
        /Yola|Jos|Abuja|Kaduna|Lagos|Kano|Port Harcourt|Adamawa|Nigeria|state|LGA/i,
      );
      expect(text).toContain(`${coordinates.latitude},${coordinates.longitude}`);
    }
  });

  it("changes the geographic search when the supplied location changes", () => {
    // Generic proof only: any two distinct points must produce distinct queries.
    expect(buildOverpassQuery(POINT_A, 5000)).not.toBe(buildOverpassQuery(POINT_B, 5000));
    expect(buildOverpassQuery(POINT_C, 5000)).not.toBe(buildOverpassQuery(POINT_A, 5000));
  });

  it("has no city/state allowlist anywhere in the provider implementation", async () => {
    const module = await import("./overpassProvider");
    const serialized = Object.entries(module)
      .filter(([, value]) => typeof value === "string")
      .map(([key, value]) => `${key}=${String(value)}`)
      .join("\n");
    expect(serialized).not.toMatch(/Yola|Jos|Abuja|Kaduna|Lagos|Kano|Port Harcourt|Adamawa/i);

    // An arbitrary point that no development test ever mentions still resolves.
    const { fetchFn, calls } = stubFetch(() => jsonResponse(payload([])));
    await createOverpassProvider({ fetchFn }).searchNearby(query(POINT_C));
    expect(decodeURIComponent(String(calls[0]?.init?.body))).toContain(
      `${POINT_C.latitude},${POINT_C.longitude}`,
    );
  });
});

describe("tag mapping", () => {
  it("maps structured amenity/healthcare tags", () => {
    expect(mapOsmCategory({ amenity: "hospital" })).toBe("hospital");
    expect(mapOsmCategory({ amenity: "clinic" })).toBe("clinic");
    expect(mapOsmCategory({ amenity: "doctors" })).toBe("clinic");
    expect(mapOsmCategory({ amenity: "pharmacy" })).toBe("pharmacy");
    expect(mapOsmCategory({ healthcare: "centre" })).toBe("health-centre");
  });

  it("reads semicolon multi-values (real OSM data)", () => {
    // Rule precedence mirrors the curation mapper: a semicolon list resolves by
    // the first rule that matches ANY token in the list.
    expect(mapOsmCategory({ healthcare: "birthing_center;clinic;doctor;laboratory;pharmacy" })).toBe(
      "pharmacy",
    );
    expect(mapOsmCategory({ amenity: "clinic", healthcare: "birthing_center;clinic" })).toBe("clinic");
  });

  it("returns null for unrelated healthcare values instead of guessing", () => {
    expect(mapOsmCategory({ healthcare: "dentist" })).toBeNull();
    expect(mapOsmCategory({ healthcare: "laboratory" })).toBeNull();
    expect(mapOsmCategory({ amenity: "restaurant", name: "Hospital Bar" })).toBeNull();
    expect(mapOsmCategory(undefined)).toBeNull();
  });
});

describe("element normalization", () => {
  it("normalizes a named node", () => {
    const facility = normalizeOsmElement(NODE_HOSPITAL);
    expect(facility).toMatchObject({
      externalId: "node/4893220623",
      name: "Nassarawo Clinic",
      category: "hospital",
      coordinates: { latitude: 9.2801823, longitude: 12.443967 },
      sourceUrl: "https://www.openstreetmap.org/node/4893220623",
    });
  });

  it("uses the way/relation center when the element has no lat/lon", () => {
    const facility = normalizeOsmElement(WAY_PHARMACY);
    expect(facility?.coordinates).toEqual({ latitude: 9.19, longitude: 12.49 });
    expect(facility?.address).toBe("Main Street, Yola");
  });

  it("never fabricates a name for an unnamed facility", () => {
    const facility = normalizeOsmElement(WAY_HOSPITAL_UNNAMED);
    expect(facility?.name).toBe("Hospital (name not in OpenStreetMap)");
    expect(facility?.name).not.toMatch(/838437237/);
  });

  it("ignores records with missing or invalid coordinates (never defaults to 0,0)", () => {
    expect(normalizeOsmElement(WAY_WITHOUT_CENTER)).toBeNull();
    expect(normalizeOsmElement({ ...WAY_WITHOUT_CENTER, center: { lat: Number.NaN, lon: 1 } })).toBeNull();
    expect(normalizeOsmElement({ ...WAY_WITHOUT_CENTER, center: { lat: 9.2, lon: 200 } })).toBeNull();
    expect(normalizeOsmElement({ ...NODE_HOSPITAL, lat: undefined })).toBeNull();
    expect(normalizeOsmElement({ ...NODE_HOSPITAL, lat: 95 })).toBeNull();
    expect(normalizeOsmElement({ ...NODE_HOSPITAL, lon: "12.4" })).toBeNull();
  });

  it("ignores records without a usable identity or an unmapped category", () => {
    expect(normalizeOsmElement({ ...NODE_HOSPITAL, id: undefined })).toBeNull();
    expect(normalizeOsmElement({ ...NODE_HOSPITAL, type: "area" })).toBeNull();
    expect(normalizeOsmElement({ ...NODE_HOSPITAL, tags: { healthcare: "dentist" } })).toBeNull();
    expect(normalizeOsmElement(null)).toBeNull();
    expect(normalizeOsmElement("element")).toBeNull();
  });

  it("omits metadata OSM does not provide instead of inventing it", () => {
    const facility = normalizeOsmElement(WAY_HOSPITAL_UNNAMED);
    expect(facility?.phone).toBeUndefined();
    expect(facility?.openingHours).toBeUndefined();
    expect(facility?.address).toBeUndefined();
    expect(facility?.operator).toBeUndefined();
  });

  it("does not assign trust or distance at the provider boundary", () => {
    const facility = normalizeOsmElement(NODE_HOSPITAL);
    expect(facility?.distanceMeters).toBeNaN();
    expect(facility?.trust).toBeUndefined();
  });
});

describe("provider request lifecycle", () => {
  it("posts only coordinates, radius and the static tag filter — no user data", async () => {
    const { calls, fetchFn } = stubFetch(() => jsonResponse(payload([])));
    const provider = createOverpassProvider({ fetchFn });

    await provider.searchNearby(query());

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(OVERPASS_ENDPOINT);
    expect(calls[0]?.init?.method).toBe("POST");
    const body = String(calls[0]?.init?.body);
    expect(body.startsWith("data=")).toBe(true);
    const decoded = decodeURIComponent(body.slice("data=".length));
    expect(decoded).toContain("9.2398,12.4987");
    // No identity, contact or profile data may ever leave the device.
    expect(decoded).not.toMatch(/uid|email|phone|token|api[-_]?key|firebase/i);
    expect(decoded).not.toContain("@");
  });

  it("normalizes a valid response into candidates", async () => {
    const { fetchFn } = stubFetch(() =>
      jsonResponse(payload([NODE_HOSPITAL, WAY_PHARMACY, WAY_HOSPITAL_UNNAMED])),
    );
    const facilities = await createOverpassProvider({ fetchFn }).searchNearby(query());

    expect(facilities.map((facility) => facility.externalId)).toEqual([
      "node/4893220623",
      "way/555",
      "way/838437237",
    ]);
    expect(facilities.every((facility) => facility.source.label === "OpenStreetMap")).toBe(true);
  });

  it("collapses duplicate OSM identities to a single result", async () => {
    const { fetchFn } = stubFetch(() =>
      jsonResponse(payload([NODE_HOSPITAL, { ...NODE_HOSPITAL }, WAY_PHARMACY])),
    );
    const facilities = await createOverpassProvider({ fetchFn }).searchNearby(query());
    expect(facilities).toHaveLength(2);
  });

  it("drops unusable records but keeps the usable ones (one bad record never fails the search)", async () => {
    const { fetchFn } = stubFetch(() =>
      jsonResponse(
        payload([
          null,
          "junk",
          { type: "node", id: 1 },
          { type: "node", id: 2, lat: 9.28, lon: 12.44, tags: { amenity: "hospital", name: "Good" } },
        ]),
      ),
    );
    const facilities = await createOverpassProvider({ fetchFn }).searchNearby(query());
    expect(facilities).toHaveLength(1);
    expect(facilities[0]?.name).toBe("Good");
  });

  it("treats an empty response as a successful empty result", async () => {
    const { fetchFn } = stubFetch(() => jsonResponse(payload([])));
    await expect(createOverpassProvider({ fetchFn }).searchNearby(query())).resolves.toEqual([]);
  });

  it("honours the optional category filter on normalized categories", async () => {
    const { fetchFn } = stubFetch(() =>
      jsonResponse(payload([NODE_HOSPITAL, WAY_PHARMACY, WAY_HOSPITAL_UNNAMED])),
    );
    const facilities = await createOverpassProvider({ fetchFn }).searchNearby({
      ...query(),
      categories: ["pharmacy"],
    });
    expect(facilities.map((facility) => facility.category)).toEqual(["pharmacy"]);
  });

  it("rejects invalid input with the normalized codes before any request", async () => {
    const { calls, fetchFn } = stubFetch(() => jsonResponse(payload([])));
    const provider = createOverpassProvider({ fetchFn });

    await expect(provider.searchNearby(query({ latitude: 95, longitude: 12 }))).rejects.toMatchObject(
      { code: "invalid-coordinates" },
    );
    await expect(provider.searchNearby(query(POINT_A, 5))).rejects.toMatchObject({ code: "invalid-radius" });
    expect(calls).toHaveLength(0);
  });
});

describe("failure handling", () => {
  it("maps network failure to provider-unavailable after the single retry", async () => {
    const { calls, fetchFn } = stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    const provider = createOverpassProvider({ fetchFn, retryDelayMs: 0 });

    await expect(provider.searchNearby(query())).rejects.toMatchObject({ code: "provider-unavailable" });
    expect(calls).toHaveLength(2);
  });

  it("aborts a slow request and maps it to provider-timeout", async () => {
    vi.useFakeTimers();
    // A transport that only settles when the provider's abort signal fires —
    // exactly what a real fetch does when the client timeout wins.
    const { calls, fetchFn } = stubFetch(
      (call) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = call.init?.signal;
          const abort = (): void => {
            const error = new Error("The operation was aborted.");
            error.name = "AbortError";
            reject(error);
          };
          if (signal == null) return;
          if (signal.aborted) abort();
          else signal.addEventListener("abort", abort, { once: true });
        }),
    );
    const provider = createOverpassProvider({ fetchFn, retries: 0 });

    const pending = provider.searchNearby(query());
    const assertion = expect(pending).rejects.toMatchObject({ code: "provider-timeout" });
    await vi.advanceTimersByTimeAsync(OVERPASS_CLIENT_TIMEOUT_MS + 50);
    await assertion;
    expect(calls).toHaveLength(1);
  });

  it("maps HTTP 429 to provider-rate-limited after the retry", async () => {
    const { calls, fetchFn } = stubFetch(() => new Response("rate limited", { status: 429 }));
    const provider = createOverpassProvider({ fetchFn, retryDelayMs: 0 });

    await expect(provider.searchNearby(query())).rejects.toMatchObject({ code: "provider-rate-limited" });
    expect(calls).toHaveLength(2);
  });

  it("maps HTTP 5xx to provider-unavailable", async () => {
    const { fetchFn } = stubFetch(() => new Response("upstream error", { status: 504 }));
    const provider = createOverpassProvider({ fetchFn, retryDelayMs: 0 });
    await expect(provider.searchNearby(query())).rejects.toMatchObject({ code: "provider-unavailable" });
  });

  it("does not retry a non-retryable 4xx", async () => {
    const { calls, fetchFn } = stubFetch(() => new Response("bad request", { status: 400 }));
    const provider = createOverpassProvider({ fetchFn, retryDelayMs: 0 });
    await expect(provider.searchNearby(query())).rejects.toMatchObject({ code: "provider-unavailable" });
    expect(calls).toHaveLength(1);
  });

  it("maps malformed JSON and unexpected shapes to provider-malformed-response without retrying", async () => {
    const bad = stubFetch(() => new Response("{not json", { status: 200 }));
    await expect(
      createOverpassProvider({ fetchFn: bad.fetchFn, retryDelayMs: 0 }).searchNearby(query()),
    ).rejects.toMatchObject({ code: "provider-malformed-response" });
    expect(bad.calls).toHaveLength(1);

    const shapeless = stubFetch(() => jsonResponse(JSON.stringify({ items: [] })));
    await expect(
      createOverpassProvider({ fetchFn: shapeless.fetchFn, retryDelayMs: 0 }).searchNearby(query()),
    ).rejects.toMatchObject({ code: "provider-malformed-response" });
  });

  it("never leaks transport details through the error", async () => {
    const { fetchFn } = stubFetch(() => {
      throw new TypeError("connect ECONNREFUSED 127.0.0.1:443 key=SECRET");
    });
    const provider = createOverpassProvider({ fetchFn, retryDelayMs: 0 });
    try {
      await provider.searchNearby(query());
      throw new Error("expected the search to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(NearbyDiscoveryError);
      expect(String((error as Error).message)).not.toContain("SECRET");
      expect(String((error as Error).message)).not.toContain("127.0.0.1");
    }
  });
});

describe("session-local request lifecycle", () => {
  it("reuses an in-flight request instead of querying twice for the same coordinates", async () => {
    const { calls, fetchFn } = stubFetch(async () => jsonResponse(payload([NODE_HOSPITAL])));
    const provider = createOverpassProvider({ fetchFn });

    const [a, b] = await Promise.all([provider.searchNearby(query()), provider.searchNearby(query())]);
    expect(calls).toHaveLength(1);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("serves a repeat search from the session cache and re-queries for a different location", async () => {
    const { calls, fetchFn } = stubFetch(() => jsonResponse(payload([NODE_HOSPITAL])));
    const provider = createOverpassProvider({ fetchFn });

    await provider.searchNearby(query());
    await provider.searchNearby(query());
    expect(calls).toHaveLength(1);

    await provider.searchNearby(query(POINT_B));
    expect(calls).toHaveLength(2);
    expect(decodeURIComponent(String(calls[1]?.init?.body))).toContain("9.8965,8.8583");
  });

  it("stores nothing in browser storage (no persisted location history)", async () => {
    const setSpy = vi.spyOn(Storage.prototype, "setItem");
    const { fetchFn } = stubFetch(() => jsonResponse(payload([NODE_HOSPITAL])));
    await createOverpassProvider({ fetchFn }).searchNearby(query());
    expect(setSpy).not.toHaveBeenCalled();
  });
});
