import { describe, expect, it } from "vitest";

import { extractOsmReferences, compareWithCurated, type CandidateView, type CuratedRecordView } from "./compare.ts";

function candidateView(overrides: Partial<CandidateView> & { candidateId: string }): CandidateView {
  return {
    name: "Fixture General Hospital",
    coordinates: { latitude: 9.21, longitude: 12.47 },
    phone: null,
    openingHours: null,
    addressCandidate: null,
    osmType: "node",
    osmId: 900001,
    ...overrides,
  };
}

const CURATED: CuratedRecordView = {
  documentId: "facility-fixture-general-hospital-p9-2100-p12-4700",
  name: "Fixture General Hospital",
  coordinates: { latitude: 9.21, longitude: 12.47 },
  phone: "+2348000000001",
  openingHours: "24/7",
  address: "Abuja Road, Yola, Adamawa State, Nigeria",
  source: "OpenStreetMap node/900001 (9.21,12.47), retrieved and verified 2026-09-17",
};

describe("extractOsmReferences", () => {
  it("extracts node/way/relation references from provenance strings", () => {
    const refs = extractOsmReferences(
      "OpenStreetMap way/1288856908 and node/13860924598, verified 2026-09-17; relation/55 noted",
    );
    expect(refs).toEqual([
      { type: "way", id: 1288856908 },
      { type: "node", id: 13860924598 },
      { type: "relation", id: 55 },
    ]);
  });

  it("returns empty for provenance without OSM references", () => {
    expect(extractOsmReferences("Official website (example.org), verified 2026-09-17")).toEqual([]);
  });
});

describe("compareWithCurated", () => {
  it("classifies a provenance-referenced candidate as KNOWN_EXACT", () => {
    const findings = compareWithCurated(
      [candidateView({ candidateId: "osm-node-900001" })],
      [CURATED],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.status).toBe("KNOWN_EXACT");
    expect(findings[0]?.matchedDocumentId).toBe(CURATED.documentId ?? null);
  });

  it("classifies a deterministic-id match as KNOWN_EXACT (caller pre-derives the id)", () => {
    const findings = compareWithCurated(
      [
        candidateView({
          candidateId: "osm-node-999999",
          osmId: 999999,
          documentId: "facility-fixture-general-hospital-p9-2100-p12-4700",
        }),
      ],
      [CURATED],
    );
    expect(findings[0]?.status).toBe("KNOWN_EXACT");
    expect(findings[0]?.matchedDocumentId).toContain("fixture-general-hospital");
  });

  it("classifies same-name-nearby as KNOWN_PROBABLE when no reference/id matches", () => {
    const findings = compareWithCurated(
      [candidateView({ candidateId: "osm-node-888888", osmId: 888888, coordinates: { latitude: 9.2101, longitude: 12.4701 } })],
      [CURATED],
    );
    expect(findings[0]?.status).toBe("KNOWN_PROBABLE");
    expect(findings[0]?.reason).toMatch(/normalized-name match/);
  });

  it("classifies unmatched candidates as NEW", () => {
    const findings = compareWithCurated(
      [candidateView({ candidateId: "osm-node-777777", osmId: 777777, name: "Brand New Clinic", coordinates: { latitude: 9.5, longitude: 12.7 } })],
      [CURATED],
    );
    expect(findings[0]?.status).toBe("NEW");
    expect(findings[0]?.matchedDocumentId).toBeNull();
  });

  it("surfaces CHANGED_INFO when matched info differs (never auto-applies)", () => {
    const findings = compareWithCurated(
      [candidateView({ candidateId: "osm-node-900001", phone: "+2348000000009", openingHours: "Mo-Fr 08:00-17:00" })],
      [CURATED],
    );
    expect(findings[0]?.status).toBe("CHANGED_INFO");
    expect(findings[0]?.changedFields).toEqual(
      expect.arrayContaining(["phone", "openingHours"]),
    );
  });

  it("does not flag identical info as changed", () => {
    const findings = compareWithCurated(
      [candidateView({ candidateId: "osm-node-900001", phone: "+2348000000001", openingHours: "24/7", addressCandidate: "Abuja Road, Yola, Adamawa State, Nigeria" })],
      [CURATED],
    );
    expect(findings[0]?.status).toBe("KNOWN_EXACT");
    expect(findings[0]?.changedFields).toEqual([]);
  });

  it("treats curated-only data (candidate nulls) as not-changed", () => {
    const findings = compareWithCurated(
      [candidateView({ candidateId: "osm-node-900001" })],
      [CURATED],
    );
    expect(findings[0]?.changedFields).toEqual([]);
  });

  it("never mutates curated inputs (read-only by construction)", () => {
    const curated: CuratedRecordView = { ...CURATED };
    const snapshot = JSON.stringify(curated);
    compareWithCurated(
      [candidateView({ candidateId: "osm-node-900001", phone: "different" })],
      [curated],
    );
    expect(JSON.stringify(curated)).toBe(snapshot);
  });
});
