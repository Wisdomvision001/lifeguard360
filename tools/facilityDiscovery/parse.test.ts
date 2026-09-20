import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { candidateSchema, parseOverpassResponse, type DiscoveryMeta } from "./parse.ts";

const DISCOVERY: DiscoveryMeta = {
  region: "yola-jimeta",
  bbox: [8.85, 12.35, 9.65, 12.75],
  endpoint: "https://overpass-api.de/api/interpreter",
  queryRef: "medical-v1",
  retrievedAt: "2026-09-18T00:00:00.000Z",
};

function wrap(elements: unknown): unknown {
  return { version: 0.6, elements };
}

describe("parseOverpassResponse", () => {
  it("rejects a non-object payload and a payload without elements", () => {
    expect(() => parseOverpassResponse(null, DISCOVERY)).toThrow(/not a JSON object/);
    expect(() => parseOverpassResponse("nope", DISCOVERY)).toThrow(/not a JSON object/);
    expect(() => parseOverpassResponse({}, DISCOVERY)).toThrow(/elements/);
  });

  it("parses a valid node with full tags into a schema-conformant candidate", () => {
    const { candidates, skipped } = parseOverpassResponse(
      wrap([
        {
          type: "node",
          id: 123,
          lat: 9.21,
          lon: 12.47,
          version: 4,
          tags: {
            amenity: "hospital",
            name: "Test Hospital",
            "addr:street": "Abuja Road",
            "addr:city": "Yola",
            phone: "+2348000000001",
            opening_hours: "24/7",
            operator: "Test Operator",
            emergency: "yes",
          },
        },
      ]),
      DISCOVERY,
    );

    expect(skipped).toEqual([]);
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0];

    // Schema conformance (zod, including the discovery block)
    expect(candidateSchema.safeParse(candidate).success).toBe(true);

    expect(candidate?.candidateId).toBe("osm-node-123");
    expect(candidate?.osm).toEqual({
      type: "node",
      id: 123,
      url: "https://www.openstreetmap.org/node/123",
      version: 4,
    });
    expect(candidate?.name).toBe("Test Hospital");
    expect(candidate?.coordinates).toEqual({ latitude: 9.21, longitude: 12.47 });
    expect(candidate?.addressRaw).toEqual({ "addr:street": "Abuja Road", "addr:city": "Yola" });
    expect(candidate?.addressCandidate).toBe("Abuja Road, Yola");
    expect(candidate?.phone).toBe("+2348000000001");
    expect(candidate?.openingHours).toBe("24/7");
    expect(candidate?.operator).toBe("Test Operator");
    expect(candidate?.categorySuggestion).toBe("hospital");
    expect(candidate?.discovery.region).toBe("yola-jimeta");
    expect(candidate?.source).toMatch(/discovery candidate/i);
  });

  it("uses center coordinates for ways and relations", () => {
    const { candidates } = parseOverpassResponse(
      wrap([
        { type: "way", id: 200, version: 1, center: { lat: 9.3, lon: 12.5 }, tags: { amenity: "clinic", name: "Way Clinic" } },
        { type: "relation", id: 300, version: 2, center: { lat: 9.31, lon: 12.51 }, tags: { healthcare: "centre", name: "Relation Centre" } },
      ]),
      DISCOVERY,
    );
    expect(candidates.map((c) => c.candidateId)).toEqual(["osm-way-200", "osm-relation-300"]);
    expect(candidates[0]?.coordinates).toEqual({ latitude: 9.3, longitude: 12.5 });
    expect(candidates[1]?.coordinates).toEqual({ latitude: 9.31, longitude: 12.51 });
    expect(candidates[1]?.categorySuggestion).toBe("health-centre");
  });

  it("falls back to contact:phone when phone is absent (verbatim, no normalization)", () => {
    const { candidates } = parseOverpassResponse(
      wrap([
        { type: "node", id: 400, lat: 9.2, lon: 12.4, tags: { amenity: "pharmacy", name: "P", "contact:phone": "+234 801 234 5678" } },
        { type: "node", id: 401, lat: 9.2, lon: 12.4, tags: { amenity: "pharmacy", name: "Q", phone: "+2348000000009", "contact:phone": "+2348000000008" } },
      ]),
      DISCOVERY,
    );
    expect(candidates[0]?.phone).toBe("+234 801 234 5678");
    expect(candidates[1]?.phone).toBe("+2348000000009"); // phone takes precedence
  });

  it("returns null for missing name/phone/hours/operator/address (never invented)", () => {
    const { candidates } = parseOverpassResponse(
      wrap([{ type: "node", id: 500, lat: 9.2, lon: 12.4, tags: { emergency: "yes" } }]),
      DISCOVERY,
    );
    const candidate = candidates[0];
    expect(candidate?.name).toBeNull();
    expect(candidate?.phone).toBeNull();
    expect(candidate?.openingHours).toBeNull();
    expect(candidate?.operator).toBeNull();
    expect(candidate?.addressRaw).toBeNull();
    expect(candidate?.addressCandidate).toBeNull();
    // amenity/healthcare both absent → advisory unknown (not a guessed category)
    expect(candidate?.categorySuggestion).toBe("unknown");
  });

  it("preserves relevant OSM tags verbatim and drops unrelated ones", () => {
    const { candidates } = parseOverpassResponse(
      wrap([
        {
          type: "node",
          id: 600,
          lat: 9.2,
          lon: 12.4,
          tags: {
            amenity: "hospital",
            healthcare: "clinic",
            emergency: "yes",
            operator: "Op",
            phone: "0800",
            "contact:phone": "0801",
            opening_hours: "Mo-Fr 08:00-17:00",
            name: "Tag Hospital",
            shop: "convenience",
          },
        },
      ]),
      DISCOVERY,
    );
    const tags = candidates[0]?.tags ?? {};
    expect(tags).toEqual({
      amenity: "hospital",
      healthcare: "clinic",
      emergency: "yes",
      operator: "Op",
      phone: "0800",
      "contact:phone": "0801",
      opening_hours: "Mo-Fr 08:00-17:00",
    });
  });

  it("skips malformed elements with structured reasons without crashing the run", () => {
    const { candidates, skipped } = parseOverpassResponse(
      wrap([
        "not-an-object",
        { type: "boundary", id: 1 }, // unsupported type
        { type: "node", id: 0 }, // invalid id
        { type: "way", id: 2, tags: { name: "no coordinates" } }, // missing coordinates
        { type: "node", id: 3, lat: 120, lon: 999, tags: { name: "bad coordinates" } }, // malformed coordinates
        { type: "node", id: 4, lat: 9.2, lon: 12.4, tags: { amenity: "clinic", name: "Valid" } }, // survives
      ]),
      DISCOVERY,
    );
    expect(candidates.map((c) => c.candidateId)).toEqual(["osm-node-4"]);
    expect(skipped).toHaveLength(5);
    expect(skipped.map((s) => s.reason)).toEqual(
      expect.arrayContaining([
        "element is not an object",
        "unsupported or missing element type",
        "missing or invalid OSM id",
        "missing coordinates (no lat/lon and no center)",
        "malformed or out-of-range coordinates",
      ]),
    );
  });

  it("handles an empty elements array", () => {
    const { candidates, skipped } = parseOverpassResponse(wrap([]), DISCOVERY);
    expect(candidates).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it("candidates never carry a verified field (verification belongs to curation)", () => {
    const { candidates } = parseOverpassResponse(
      wrap([{ type: "node", id: 700, lat: 9.2, lon: 12.4, tags: { amenity: "hospital", name: "X", verified: "yes" } }]),
      DISCOVERY,
    );
    expect(candidates[0]).not.toHaveProperty("verified");
    expect(Object.keys(candidateSchema.shape)).not.toContain("verified");
  });
});

describe("fixture integration (overpass-yola.json)", () => {
  it("parses the fixture into the expected candidates and skips", () => {
    const fixturePath = resolve(__dirname, "fixtures", "overpass-yola.json");
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
    const { candidates, skipped } = parseOverpassResponse(wrap(fixture), DISCOVERY);

    // Valid: nodes 900001/900004/900005/900006, ways 900002/900009, relation 900003.
    expect(candidates).toHaveLength(7);
    // Skipped: 900007 (missing coordinates), 900008 (malformed coordinates).
    expect(skipped).toHaveLength(2);
    expect(candidates.map((c) => c.osm.type)).toEqual(
      expect.arrayContaining(["node", "way", "relation"]),
    );

    // Missing name → null
    const unnamed = candidates.find((c) => c.candidateId === "osm-node-900006");
    expect(unnamed?.name).toBeNull();

    // No-address entry → null address
    const noAddress = candidates.find((c) => c.candidateId === "osm-way-900002");
    expect(noAddress?.addressCandidate).toBeNull();

    // Address entry composes correctly
    const addressed = candidates.find((c) => c.candidateId === "osm-node-900001");
    expect(addressed?.addressCandidate).toBe("Abuja Road, Yola, Adamawa State, Nigeria");

    // Malformed coordinates skipped with a reason
    expect(skipped.some((s) => s.osmId === 900008 && /malformed/.test(s.reason))).toBe(true);
    // Missing coordinates skipped with a reason
    expect(skipped.some((s) => s.osmId === 900007 && /missing coordinates/.test(s.reason))).toBe(true);
  });

  it("derives advisory category suggestions across the fixture mix", () => {
    const fixturePath = resolve(__dirname, "fixtures", "overpass-yola.json");
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
    const { candidates } = parseOverpassResponse(wrap(fixture), DISCOVERY);
    const byId = new Map(candidates.map((c) => [c.candidateId, c]));
    expect(byId.get("osm-node-900001")?.categorySuggestion).toBe("hospital");
    expect(byId.get("osm-way-900002")?.categorySuggestion).toBe("clinic");
    expect(byId.get("osm-relation-900003")?.categorySuggestion).toBe("health-centre");
    expect(byId.get("osm-node-900004")?.categorySuggestion).toBe("pharmacy");
    expect(byId.get("osm-node-900005")?.categorySuggestion).toBe("clinic"); // doctors → advisory clinic
  });
});
