import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildReverseGeocodeUrl,
  clearReverseGeocodeCache,
  describePlaceLabel,
  isValidGeocodeCoordinates,
  NOMINATIM_REVERSE_ENDPOINT,
  NOMINATIM_REVERSE_ZOOM,
  REVERSE_GEOCODE_ATTRIBUTION,
  REVERSE_GEOCODE_MIN_INTERVAL_MS,
  reverseGeocode,
  type ReverseGeocodeConfig,
} from "@/services/location/reverseGeocodeService";
import type { GeoCoordinates } from "@/types";

/**
 * ReverseGeocodeService — the readable-location seam (Task 1).
 *
 * The payloads below are the VERBATIM shape of live Nominatim `jsonv2` reverse
 * responses captured for Nigerian coordinates (Jimeta, Adamawa and the Abuja
 * outskirts), so the parser is exercised against real service output rather
 * than an invented one. Every test injects `fetchFn`: the suite must never
 * touch the network — both for determinism and because the usage policy caps
 * the public service at one request per second.
 */

const JIMETA: GeoCoordinates = { latitude: 9.2398, longitude: 12.4987 };
const ABUJA_OUTSKIRTS: GeoCoordinates = { latitude: 8.985, longitude: 7.402 };
const LAGOS: GeoCoordinates = { latitude: 6.5244, longitude: 3.3792 };

/** Verbatim live response for the Jimeta coordinate above. */
const JIMETA_PAYLOAD = {
  place_id: 42380941,
  licence: "Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright",
  osm_type: "way",
  osm_id: 540927929,
  lat: "9.2388158",
  lon: "12.4977643",
  category: "highway",
  type: "tertiary",
  place_rank: 26,
  importance: 0.0533792408636606,
  addresstype: "road",
  name: "",
  display_name: "Jimeta, Girei, Adamawa, 640221, Nigeria",
  address: {
    city: "Jimeta",
    county: "Girei",
    state: "Adamawa",
    "ISO3166-2-lvl4": "NG-AD",
    postcode: "640221",
    country: "Nigeria",
    country_code: "ng",
  },
  boundingbox: ["9.2292380", "9.2563446", "12.4784624", "12.5095709"],
};

/** Verbatim live response for a coordinate Nominatim cannot describe. */
const EMPTY_PAYLOAD = { error: "Unable to geocode" };

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

function jsonResponse(body: unknown, status = 200): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text, {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * Config that never waits: the rate gate has its own test, and a real
 * one-second pause would only slow every other case down.
 */
function fastConfig(fetchFn: typeof fetch, overrides: Partial<ReverseGeocodeConfig> = {}) {
  return {
    fetchFn,
    minRequestIntervalMs: 0,
    wait: (): Promise<void> => Promise.resolve(),
    ...overrides,
  };
}

/** Lets a pending lookup reach its fetch call without real time passing. */
async function flushMicrotasks(times = 6): Promise<void> {
  for (let index = 0; index < times; index++) await Promise.resolve();
}

beforeEach(() => {
  clearReverseGeocodeCache();
});

describe("buildReverseGeocodeUrl", () => {
  it("carries the coordinate and static parameters ONLY — no identity of any kind", () => {
    const url = new URL(buildReverseGeocodeUrl(JIMETA));

    expect(url.origin + url.pathname).toBe(NOMINATIM_REVERSE_ENDPOINT);
    expect([...url.searchParams.keys()].sort()).toEqual([
      "accept-language",
      "addressdetails",
      "format",
      "lat",
      "lon",
      "zoom",
    ]);
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("lat")).toBe("9.2398");
    expect(url.searchParams.get("lon")).toBe("12.4987");
    expect(url.searchParams.get("zoom")).toBe(String(NOMINATIM_REVERSE_ZOOM));
    expect(url.searchParams.get("addressdetails")).toBe("1");
    expect(url.searchParams.get("accept-language")).toBe("en");

    // Nothing account-shaped can appear: no uid, email, phone, token or key.
    for (const forbidden of ["uid", "email", "phone", "token", "key"]) {
      expect(url.searchParams.has(forbidden)).toBe(false);
    }
  });

  it("requests locality-level detail so a nearby shop is never presented as the user's place", () => {
    expect(NOMINATIM_REVERSE_ZOOM).toBe(16);
  });
});

describe("isValidGeocodeCoordinates", () => {
  it("accepts real coordinates and rejects out-of-range or non-numeric ones", () => {
    expect(isValidGeocodeCoordinates(JIMETA)).toBe(true);
    expect(isValidGeocodeCoordinates({ latitude: 0, longitude: 0 })).toBe(true);
    expect(isValidGeocodeCoordinates({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isValidGeocodeCoordinates({ latitude: 0, longitude: -181 })).toBe(false);
    expect(isValidGeocodeCoordinates({ latitude: Number.NaN, longitude: 12.5 })).toBe(false);
    expect(isValidGeocodeCoordinates(null)).toBe(false);
    expect(isValidGeocodeCoordinates("9.2,12.5")).toBe(false);
  });
});

describe("describePlaceLabel", () => {
  it("uses the returned display_name verbatim", () => {
    expect(describePlaceLabel(JIMETA_PAYLOAD)).toBe("Jimeta, Girei, Adamawa, 640221, Nigeria");
  });

  it("composes a label from the address parts OSM actually returned when display_name is absent", () => {
    expect(
      describePlaceLabel({
        place_id: 1,
        address: {
          city: "Abuja",
          county: "Municipal Area Council",
          state: "Federal Capital Territory",
          country: "Nigeria",
        },
      }),
    ).toBe("Abuja, Municipal Area Council, Federal Capital Territory, Nigeria");
  });

  it("de-duplicates repeated address parts instead of padding the label", () => {
    expect(
      describePlaceLabel({ address: { city: "Jimeta", state: "Jimeta", country: "Nigeria" } }),
    ).toBe("Jimeta, Nigeria");
  });

  it("shows only the factual part when the only information returned is the country", () => {
    expect(describePlaceLabel({ address: { country: "Nigeria" } })).toBe("Nigeria");
  });

  it("never invents a label from an unusable payload", () => {
    expect(describePlaceLabel({})).toBeNull();
    expect(describePlaceLabel({ address: {} })).toBeNull();
    expect(describePlaceLabel({ display_name: "   " })).toBeNull();
    expect(describePlaceLabel({ error: "Unable to geocode" })).toBeNull();
    expect(describePlaceLabel(null)).toBeNull();
    expect(describePlaceLabel("Jimeta")).toBeNull();
  });
});

describe("reverseGeocode — success and incomplete responses", () => {
  it("returns the real OpenStreetMap description with its attribution", async () => {
    const { calls, fetchFn } = stubFetch(() => jsonResponse(JIMETA_PAYLOAD));

    const outcome = await reverseGeocode(JIMETA, fastConfig(fetchFn));

    expect(outcome.reason).toBeNull();
    expect(outcome.place?.label).toBe("Jimeta, Girei, Adamawa, 640221, Nigeria");
    expect(outcome.place?.attribution).toBe(REVERSE_GEOCODE_ATTRIBUTION);
    expect(outcome.place?.coordinates).toEqual(JIMETA);
    expect(calls).toHaveLength(1);
  });

  it("sends the request as a credential-free GET with no personal data anywhere", async () => {
    const { calls, fetchFn } = stubFetch(() => jsonResponse(JIMETA_PAYLOAD));

    await reverseGeocode(JIMETA, fastConfig(fetchFn));

    const [{ url, init }] = calls;
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.credentials).toBe("omit");
    expect(init?.headers).toEqual({ Accept: "application/json" });
    // The identifying Referer is the browser default, so referrerPolicy must
    // deliberately NOT be forced to "no-referrer".
    expect(init?.referrerPolicy).toBeUndefined();
    const serialised = `${url} ${JSON.stringify(init)}`.toLowerCase();
    for (const forbidden of ["uid", "email", "phone", "contact", "profile", "firebase"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("accepts an incomplete response and shows only what was returned", async () => {
    const { fetchFn } = stubFetch(() =>
      jsonResponse({ place_id: 7, address: { state: "Adamawa", country: "Nigeria" } }),
    );

    const outcome = await reverseGeocode(JIMETA, fastConfig(fetchFn));

    expect(outcome.place?.label).toBe("Adamawa, Nigeria");
    expect(outcome.reason).toBeNull();
  });
});

describe("reverseGeocode — failure taxonomy (graceful, never thrown)", () => {
  it("reports no-result when Nominatim cannot geocode the coordinate", async () => {
    const { fetchFn } = stubFetch(() => jsonResponse(EMPTY_PAYLOAD));

    const outcome = await reverseGeocode(JIMETA, fastConfig(fetchFn));

    expect(outcome.place).toBeNull();
    expect(outcome.reason).toBe("no-result");
  });

  it("reports malformed for a body that is not a usable Nominatim response", async () => {
    const notJson = stubFetch(() => jsonResponse("<html>bad gateway</html>"));
    const jsonNull = stubFetch(() => jsonResponse("null"));
    const arrayShaped = stubFetch(() => jsonResponse([1, 2, 3]));

    expect((await reverseGeocode(JIMETA, fastConfig(notJson.fetchFn))).reason).toBe("malformed");
    expect((await reverseGeocode(JIMETA, fastConfig(jsonNull.fetchFn))).reason).toBe("malformed");
    expect((await reverseGeocode(JIMETA, fastConfig(arrayShaped.fetchFn))).reason).toBe(
      "malformed",
    );
  });

  it("reports rate-limited on 429 and does NOT retry", async () => {
    const { calls, fetchFn } = stubFetch(() => new Response("", { status: 429 }));

    const outcome = await reverseGeocode(JIMETA, fastConfig(fetchFn));

    expect(outcome).toEqual({ place: null, reason: "rate-limited" });
    // A second attempt would push the whole application past the policy ceiling.
    expect(calls).toHaveLength(1);
  });

  it("reports unavailable on 5xx and on a network failure", async () => {
    const server = stubFetch(() => new Response("", { status: 503 }));
    const offline = stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    expect((await reverseGeocode(JIMETA, fastConfig(server.fetchFn))).reason).toBe("unavailable");
    expect((await reverseGeocode(JIMETA, fastConfig(offline.fetchFn))).reason).toBe("unavailable");
    expect(server.calls).toHaveLength(1);
  });

  it("reports timeout when the request outruns the abort budget", async () => {
    const { fetchFn } = stubFetch(
      (_call, _index) =>
        new Promise<Response>((_resolve, reject) => {
          // The service aborts through the injected signal; the stub rejects the
          // same way a real aborted fetch does.
          setTimeout(() => {
            const abortError = new Error("aborted");
            abortError.name = "AbortError";
            reject(abortError);
          }, 0);
        }),
    );

    const outcome = await reverseGeocode(JIMETA, fastConfig(fetchFn, { timeoutMs: 5 }));

    expect(outcome).toEqual({ place: null, reason: "timeout" });
  });

  it("aborts its own request when the service budget expires", async () => {
    let sawAbort = false;
    const { fetchFn } = stubFetch(
      (call) =>
        new Promise<Response>((_resolve, reject) => {
          call.init?.signal?.addEventListener("abort", () => {
            sawAbort = true;
            const abortError = new Error("aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        }),
    );

    await reverseGeocode(JIMETA, fastConfig(fetchFn, { timeoutMs: 5 }));

    expect(sawAbort).toBe(true);
  });

  it("rejects invalid coordinates without any request leaving the device", async () => {
    const { calls, fetchFn } = stubFetch(() => jsonResponse(JIMETA_PAYLOAD));

    const outOfRange = await reverseGeocode({ latitude: 91, longitude: 12.5 }, fastConfig(fetchFn));
    const notANumber = await reverseGeocode(
      { latitude: Number.NaN, longitude: Number.NaN },
      fastConfig(fetchFn),
    );

    expect(outOfRange.reason).toBe("invalid-coordinates");
    expect(notANumber.reason).toBe("invalid-coordinates");
    expect(calls).toHaveLength(0);
  });
});

describe("reverseGeocode — session-memory cache and rate gate", () => {
  it("caches a success for the session so the same spot is never queried twice", async () => {
    const { calls, fetchFn } = stubFetch(() => jsonResponse(JIMETA_PAYLOAD));

    const first = await reverseGeocode(JIMETA, fastConfig(fetchFn));
    const second = await reverseGeocode({ ...JIMETA }, fastConfig(fetchFn));
    await reverseGeocode(ABUJA_OUTSKIRTS, fastConfig(fetchFn));

    expect(calls).toHaveLength(2);
    expect(second.place?.label).toBe(first.place?.label);
  });

  it("keys the cache on rounded coordinates so GPS jitter cannot re-query the service", async () => {
    const { calls, fetchFn } = stubFetch(() => jsonResponse(JIMETA_PAYLOAD));

    await reverseGeocode(JIMETA, fastConfig(fetchFn));
    // ~8 m away — the same place for our purposes.
    await reverseGeocode({ latitude: 9.23982, longitude: 12.49872 }, fastConfig(fetchFn));

    expect(calls).toHaveLength(1);
  });

  it("de-duplicates in-flight requests for the same coordinate", async () => {
    let settle: (response: Response) => void = () => undefined;
    const { calls, fetchFn } = stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          settle = resolve;
        }),
    );

    const first = reverseGeocode(JIMETA, fastConfig(fetchFn));
    const second = reverseGeocode(JIMETA, fastConfig(fetchFn));
    await flushMicrotasks();
    settle(jsonResponse(JIMETA_PAYLOAD));

    const [a, b] = await Promise.all([first, second]);

    expect(calls).toHaveLength(1);
    expect(a.place?.label).toBe(b.place?.label);
  });

  it("spaces consecutive requests by the policy's one second, using the injected clock", async () => {
    const { fetchFn } = stubFetch(() => jsonResponse(JIMETA_PAYLOAD));
    const waits: number[] = [];
    let clock = 1_000_000;
    const config: ReverseGeocodeConfig = {
      fetchFn,
      now: (): number => clock,
      wait: (ms: number): Promise<void> => {
        waits.push(ms);
        // A real wait advances time; the injected clock must model that.
        clock += ms;
        return Promise.resolve();
      },
    };

    await reverseGeocode(JIMETA, config);
    await reverseGeocode(ABUJA_OUTSKIRTS, config);

    expect(REVERSE_GEOCODE_MIN_INTERVAL_MS).toBe(1_000);
    expect(waits).toEqual([REVERSE_GEOCODE_MIN_INTERVAL_MS]);

    // Once a full second has passed since the last request, nothing is delayed.
    clock += REVERSE_GEOCODE_MIN_INTERVAL_MS;
    await reverseGeocode(LAGOS, config);
    expect(waits).toHaveLength(1);
  });

  it("clears the cache, in-flight map and rate gate on demand", async () => {
    const { calls, fetchFn } = stubFetch(() => jsonResponse(JIMETA_PAYLOAD));

    await reverseGeocode(JIMETA, fastConfig(fetchFn));
    clearReverseGeocodeCache();
    await reverseGeocode(JIMETA, fastConfig(fetchFn));

    expect(calls).toHaveLength(2);
  });

  it("does not cache failures — a later attempt can still succeed", async () => {
    const failing = stubFetch(() => new Response("", { status: 503 }));
    const working = stubFetch(() => jsonResponse(JIMETA_PAYLOAD));

    expect((await reverseGeocode(JIMETA, fastConfig(failing.fetchFn))).reason).toBe("unavailable");
    expect((await reverseGeocode(JIMETA, fastConfig(working.fetchFn))).place?.label).toBe(
      "Jimeta, Girei, Adamawa, 640221, Nigeria",
    );
  });
});

describe("reverseGeocode — no persistent storage, no tracking", () => {
  it("writes nothing to device storage", async () => {
    const { fetchFn } = stubFetch(() => jsonResponse(JIMETA_PAYLOAD));

    await reverseGeocode(JIMETA, fastConfig(fetchFn));

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("never calls the browser Geolocation API — acquisition stays in locationService", async () => {
    const getCurrentPosition = vi.fn();
    const watchPosition = vi.fn();
    vi.stubGlobal("navigator", {
      geolocation: { getCurrentPosition, watchPosition, clearWatch: vi.fn() },
    });
    const { fetchFn } = stubFetch(() => jsonResponse(JIMETA_PAYLOAD));

    await reverseGeocode(JIMETA, fastConfig(fetchFn));

    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(watchPosition).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
