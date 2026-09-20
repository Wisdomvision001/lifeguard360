import { describe, expect, it } from "vitest";

import {
  collapseExactIdentity,
  flagDuplicates,
  haversineMeters,
  normalizeName,
  type CandidateLike,
} from "./dedupe.ts";

function candidate(id: string, name: string | null, latitude: number, longitude: number): CandidateLike {
  return { candidateId: id, name, coordinates: { latitude, longitude } };
}

// ~0.00009° latitude ≈ 10 m; ~0.0004° ≈ 44 m; ~0.0009° ≈ 100 m at Yola's latitude.
const TEN_M = 0.00009;
const FORTY_M = 0.0004;
const HUNDRED_M = 0.0009;

describe("haversineMeters", () => {
  it("measures zero distance for identical coordinates", () => {
    expect(haversineMeters({ latitude: 9.2, longitude: 12.4 }, { latitude: 9.2, longitude: 12.4 })).toBe(0);
  });

  it("measures a plausible distance for a known separation", () => {
    // Roughly 111 km per degree of latitude.
    const d = haversineMeters({ latitude: 9.0, longitude: 12.4 }, { latitude: 9.1, longitude: 12.4 });
    expect(d).toBeGreaterThan(10_000);
    expect(d).toBeLessThan(12_000);
  });
});

describe("normalizeName", () => {
  it("lowercases, trims, strips punctuation and collapses whitespace", () => {
    expect(normalizeName("  St. Mary's   Hospital!  ")).toBe("st marys hospital");
  });

  it("strips diacritics for comparison", () => {
    expect(normalizeName("Hôpital Général")).toBe("hopital general");
  });
});

describe("collapseExactIdentity", () => {
  it("collapses same candidateId entries, keeping the highest OSM version", () => {
    const first = { ...candidate("osm-way-1", "A", 9.2, 12.4), osm: { version: 2 } };
    const second = { ...candidate("osm-way-1", "A", 9.2, 12.4), osm: { version: 5 } };
    const { canonical, flags } = collapseExactIdentity([first, second]);
    expect(canonical).toHaveLength(1);
    expect(canonical[0]?.osm?.version).toBe(5);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.type).toBe("EXACT_OSM_IDENTITY");
  });

  it("leaves distinct elements untouched", () => {
    const { canonical, flags } = collapseExactIdentity([
      candidate("osm-node-1", "A", 9.2, 12.4),
      candidate("osm-node-2", "B", 9.3, 12.5),
    ]);
    expect(canonical).toHaveLength(2);
    expect(flags).toEqual([]);
  });
});

describe("flagDuplicates", () => {
  it("flags <=25 m pairs as POSSIBLE_SAME_SITE regardless of name", () => {
    const flags = flagDuplicates([
      candidate("osm-node-1", "Alpha Hospital", 9.2, 12.4),
      candidate("osm-way-2", "Beta Clinic", 9.2 + TEN_M, 12.4),
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.type).toBe("POSSIBLE_SAME_SITE");
    expect(flags[0]?.distanceMeters).toBeLessThanOrEqual(25);
  });

  it("flags 25–50 m same-name pairs as PROBABLE_DUPLICATE", () => {
    const flags = flagDuplicates([
      candidate("osm-node-1", "Alpha Hospital", 9.2, 12.4),
      candidate("osm-node-2", "Alpha Hospital", 9.2 + FORTY_M, 12.4),
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.type).toBe("PROBABLE_DUPLICATE");
    expect(flags[0]?.distanceMeters).toBeGreaterThan(25);
    expect(flags[0]?.distanceMeters).toBeLessThanOrEqual(50);
  });

  it("flags 50–150 m same-name pairs as NAME_VARIANT", () => {
    const flags = flagDuplicates([
      candidate("osm-node-1", "Alpha Hospital", 9.2, 12.4),
      candidate("osm-node-2", "Alpha Hospital", 9.2 + HUNDRED_M, 12.4),
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.type).toBe("NAME_VARIANT");
  });

  it("does not flag same-name pairs beyond 150 m", () => {
    const flags = flagDuplicates([
      candidate("osm-node-1", "Alpha Hospital", 9.2, 12.4),
      candidate("osm-node-2", "Alpha Hospital", 9.3, 12.4), // ~11 km
    ]);
    expect(flags).toEqual([]);
  });

  it("does not flag different-name pairs beyond 25 m", () => {
    const flags = flagDuplicates([
      candidate("osm-node-1", "Alpha Hospital", 9.2, 12.4),
      candidate("osm-node-2", "Beta Clinic", 9.21, 12.4),
    ]);
    expect(flags).toEqual([]);
  });

  it("ignores missing names for name-based flags but still applies same-site", () => {
    const flags = flagDuplicates([
      candidate("osm-node-1", null, 9.2, 12.4),
      candidate("osm-node-2", null, 9.2 + TEN_M, 12.4),
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.type).toBe("POSSIBLE_SAME_SITE");
  });

  it("is order-stable: pair (i,j) always emitted as A=i, B=j", () => {
    const flags = flagDuplicates([
      candidate("osm-node-1", "Same Clinic", 9.2, 12.4),
      candidate("osm-node-2", "Same Clinic", 9.2 + TEN_M, 12.4),
    ]);
    expect(flags[0]?.candidateAId).toBe("osm-node-1");
    expect(flags[0]?.candidateBId).toBe("osm-node-2");
  });
});
