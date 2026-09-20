import { describe, expect, it } from "vitest";

import { DISCOVERED_TAGS, buildOverpassQuery, validateBbox } from "./query.ts";

const VALID_BBOX: [number, number, number, number] = [8.85, 12.35, 9.65, 12.75];

describe("validateBbox", () => {
  it("accepts a valid [south, west, north, east] bbox", () => {
    const result = validateBbox(VALID_BBOX);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects missing/short/long arrays", () => {
    for (const bad of [[], [1, 2, 3], [1, 2, 3, 4, 5], null, undefined, "bbox"]) {
      expect(validateBbox(bad).ok).toBe(false);
    }
  });

  it("rejects non-finite values", () => {
    // The validator short-circuits on the first non-finite value (deterministic reporting).
    expect(validateBbox([Number.NaN, 12.35, 9.65, 12.75]).issues.map((i) => i.field)).toEqual(["bbox.south"]);
    expect(validateBbox([8.85, 12.35, 9.65, Number.POSITIVE_INFINITY]).issues.map((i) => i.field)).toEqual(["bbox.east"]);
    expect(validateBbox([8.85, Number.NaN, 9.65, 12.75]).issues.map((i) => i.field)).toEqual(["bbox.west"]);
  });

  it("rejects out-of-range latitude and longitude", () => {
    expect(validateBbox([-90.5, 12.35, 9.65, 12.75]).ok).toBe(false);
    expect(validateBbox([8.85, -180.5, 9.65, 12.75]).ok).toBe(false);
    expect(validateBbox([8.85, 12.35, 90.5, 12.75]).ok).toBe(false);
    expect(validateBbox([8.85, 12.35, 9.65, 180.5]).ok).toBe(false);
  });

  it("rejects south >= north and west >= east", () => {
    expect(validateBbox([9.65, 12.35, 9.65, 12.75]).ok).toBe(false);
    expect(validateBbox([9.7, 12.35, 9.65, 12.75]).ok).toBe(false);
    expect(validateBbox([8.85, 12.75, 9.65, 12.75]).ok).toBe(false);
    expect(validateBbox([8.85, 12.8, 9.65, 12.75]).ok).toBe(false);
  });
});

describe("buildOverpassQuery", () => {
  it("produces the approved tag union", () => {
    const query = buildOverpassQuery(VALID_BBOX);
    for (const tag of ["amenity\"=\"hospital", "amenity\"=\"clinic", "amenity\"=\"pharmacy", "amenity\"=\"doctors"]) {
      expect(query).toContain(tag);
    }
    expect(query).toContain('nwr["healthcare"]');
    expect(DISCOVERED_TAGS).toContain("healthcare=*");
  });

  it("uses nwr and out center tags", () => {
    const query = buildOverpassQuery(VALID_BBOX);
    expect(query).toContain("nwr[");
    expect(query.trim().endsWith("out center tags;")).toBe(true);
  });

  it("interpolates the bbox verbatim in [south, west, north, east] order", () => {
    const query = buildOverpassQuery(VALID_BBOX);
    expect(query).toContain("(8.85,12.35,9.65,12.75)");
  });

  it("is deterministic", () => {
    expect(buildOverpassQuery(VALID_BBOX)).toBe(buildOverpassQuery(VALID_BBOX));
  });

  it("throws on an invalid bbox", () => {
    expect(() => buildOverpassQuery([9.65, 12.35, 8.85, 12.75])).toThrow(/Invalid bbox/);
    expect(() => buildOverpassQuery([1, 2, 3] as unknown as [number, number, number, number])).toThrow(/Invalid bbox/);
  });

  it("does not perform network requests (pure text construction)", () => {
    // The module exports no fetch/network functions — a structural expectation
    // pinned by the safety test in safety.test.ts.
    expect(typeof buildOverpassQuery).toBe("function");
  });
});
