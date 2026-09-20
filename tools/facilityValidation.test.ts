import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  facilityDocumentId,
  slug,
  validateDataset,
  validateFacilityRecord,
} from "./facilityValidation.js";

/** A fully valid record per docs/DATASET-CONTRACT.md. */
const VALID_RECORD = {
  name: "Test General Facility",
  category: "hospital",
  coordinates: { latitude: 10.5, longitude: 13.5 },
  verified: true,
  source: "Official test registry (example.org), verified 2026-09-10",
  updatedAt: "2026-09-14T00:00:00Z",
};

const VALID_META = {
  curator: "Test Curator",
  preparedAt: "2026-09-14",
};

function datasetWith(...facilities: unknown[]): unknown {
  return { meta: VALID_META, facilities };
}

describe("validateFacilityRecord", () => {
  it("accepts a fully valid record", () => {
    const result = validateFacilityRecord(VALID_RECORD, 0);
    expect(result.errors).toEqual([]);
    expect(result.id).toBe("facility-test-general-facility-p10-5000-p13-5000");
    expect(result.verified).toBe(true);
  });

  it("rejects a missing/empty name", () => {
    const result = validateFacilityRecord({ ...VALID_RECORD, name: "" }, 0);
    expect(result.errors.some((e) => e.field === "name")).toBe(true);
  });

  it("rejects a missing/empty category", () => {
    const result = validateFacilityRecord({ ...VALID_RECORD, category: "" }, 0);
    expect(result.errors.some((e) => e.field === "category")).toBe(true);
  });

  it("rejects latitude above 90 and below −90", () => {
    for (const latitude of [90.5, -90.5]) {
      const result = validateFacilityRecord(
        { ...VALID_RECORD, coordinates: { ...VALID_RECORD.coordinates, latitude } },
        0,
      );
      expect(result.errors.some((e) => e.field === "coordinates.latitude")).toBe(true);
    }
  });

  it("rejects longitude above 180 and below −180", () => {
    for (const longitude of [180.5, -180.5]) {
      const result = validateFacilityRecord(
        { ...VALID_RECORD, coordinates: { ...VALID_RECORD.coordinates, longitude } },
        0,
      );
      expect(result.errors.some((e) => e.field === "coordinates.longitude")).toBe(true);
    }
  });

  it("rejects 0,0 coordinates", () => {
    const result = validateFacilityRecord(
      { ...VALID_RECORD, coordinates: { latitude: 0, longitude: 0 } },
      0,
    );
    expect(result.errors.some((e) => e.field === "coordinates" && e.message.includes("0,0"))).toBe(true);
  });

  it("rejects non-finite coordinates", () => {
    const result = validateFacilityRecord(
      { ...VALID_RECORD, coordinates: { latitude: Number.NaN, longitude: Number.POSITIVE_INFINITY } },
      0,
    );
    expect(result.errors.some((e) => e.field === "coordinates.latitude")).toBe(true);
    expect(result.errors.some((e) => e.field === "coordinates.longitude")).toBe(true);
  });

  it("accepts boundary coordinates ±90/±180 and rejects 0,0 alone", () => {
    const boundary = validateFacilityRecord(
      { ...VALID_RECORD, coordinates: { latitude: -90, longitude: 180 } },
      0,
    );
    expect(boundary.errors).toEqual([]);
  });

  it("rejects a malformed phone number", () => {
    for (const phone of ["08012345678", "2348012345678", "+234-801-234", "+abc", "++2348012345678"]) {
      const result = validateFacilityRecord({ ...VALID_RECORD, phone }, 0);
      expect(result.errors.some((e) => e.field === "phone")).toBe(true);
    }
  });

  it("accepts a well-formed E.164-style phone", () => {
    const result = validateFacilityRecord({ ...VALID_RECORD, phone: "+2348012345678" }, 0);
    expect(result.errors).toEqual([]);
  });

  it("rejects a verified record with missing source", () => {
    const result = validateFacilityRecord({ ...VALID_RECORD, source: "" }, 0);
    expect(result.errors.some((e) => e.field === "source")).toBe(true);
  });

  it("rejects a verified record whose provenance lacks a verification date", () => {
    const result = validateFacilityRecord(
      { ...VALID_RECORD, source: "Official test registry (example.org)" },
      0,
    );
    expect(result.errors.some((e) => e.field === "source" && e.message.includes("verification date"))).toBe(true);
  });

  it("accepts a valid address", () => {
    const result = validateFacilityRecord({ ...VALID_RECORD, address: "Abuja Road, Yola, Adamawa State, Nigeria" }, 0);
    expect(result.errors).toEqual([]);
  });

  it("accepts records without an address (optional; legacy shapes stay valid)", () => {
    expect(validateFacilityRecord(VALID_RECORD, 0).errors).toEqual([]);
  });

  it("rejects an empty or whitespace-only address", () => {
    for (const address of ["", "   "]) {
      const result = validateFacilityRecord({ ...VALID_RECORD, address }, 0);
      expect(result.errors.some((e) => e.field === "address")).toBe(true);
    }
  });

  it("rejects an address over the 200-character limit", () => {
    expect(validateFacilityRecord({ ...VALID_RECORD, address: "a".repeat(200) }, 0).errors).toEqual([]);
    expect(validateFacilityRecord({ ...VALID_RECORD, address: "a".repeat(201) }, 0).errors.some((e) => e.field === "address")).toBe(true);
  });

  it("rejects a non-string address", () => {
    const result = validateFacilityRecord({ ...VALID_RECORD, address: 42 }, 0);
    expect(result.errors.some((e) => e.field === "address")).toBe(true);
  });

  it("rejects an invalid updatedAt", () => {
    for (const updatedAt of ["", "not-a-date", "2026-13-40"]) {
      const result = validateFacilityRecord({ ...VALID_RECORD, updatedAt }, 0);
      expect(result.errors.some((e) => e.field === "updatedAt")).toBe(true);
    }
  });

  it("derives no ID when coordinates are invalid (ID needs name + coordinates)", () => {
    const result = validateFacilityRecord(
      { ...VALID_RECORD, coordinates: { latitude: Number.NaN, longitude: 13.5 } },
      0,
    );
    expect(result.errors.some((e) => e.field === "coordinates.latitude")).toBe(true);
    expect(result.id).toBeNull();
  });

  it("does not mutate the input record", () => {
    const record = { ...VALID_RECORD, phone: "08012345678" }; // invalid on purpose
    const snapshot = JSON.stringify(record);
    validateFacilityRecord(record, 0);
    expect(JSON.stringify(record)).toBe(snapshot);
  });
});

describe("deterministic IDs", () => {
  it("generates stable IDs across calls", () => {
    const coords = { latitude: 9.2345, longitude: 12.4567 };
    const first = facilityDocumentId("Yola Specialist Hospital", coords);
    const second = facilityDocumentId("Yola Specialist Hospital", coords);
    expect(first).toBe(second);
    expect(first).toBe("facility-yola-specialist-hospital-p9-2345-p12-4567");
  });

  it("generates distinct IDs for distinct facilities", () => {
    // Same name, materially different positions (different branches) → different IDs.
    const a = facilityDocumentId("General Hospital", { latitude: 9.21, longitude: 12.47 });
    const b = facilityDocumentId("General Hospital", { latitude: 9.35, longitude: 12.55 });
    // Different name, same area → different ID.
    const c = facilityDocumentId("Federal Medical Centre", { latitude: 9.21, longitude: 12.47 });
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("rounds coordinates to 4 decimals so precision differences keep one identity", () => {
    // Differences beyond the 4th decimal (no rounding-boundary crossing).
    const a = facilityDocumentId("General Hospital", { latitude: 9.234501, longitude: 12.456701 });
    const b = facilityDocumentId("General Hospital", { latitude: 9.2345, longitude: 12.4567 });
    expect(a).toBe(b);
  });

  it("never collides across the equator/meridian or hemispheres", () => {
    const ids = [
      facilityDocumentId("Border Clinic", { latitude: 9.2345, longitude: 12.4567 }),
      facilityDocumentId("Border Clinic", { latitude: -9.2345, longitude: 12.4567 }),
      facilityDocumentId("Border Clinic", { latitude: 9.2345, longitude: -12.4567 }),
      facilityDocumentId("Border Clinic", { latitude: -9.2345, longitude: -12.4567 }),
      facilityDocumentId("Border Clinic", { latitude: 0, longitude: 0.0001 }),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("normalizes case, whitespace and punctuation consistently", () => {
    expect(
      facilityDocumentId("  St. Luke's   Clinic!  ", { latitude: 9.5, longitude: 8.5 }),
    ).toBe(facilityDocumentId("st lukes clinic", { latitude: 9.5, longitude: 8.5 }));
  });

  it("slug folds diacritics and collapses separators", () => {
    expect(slug("Çafé  Hospital—Nr. 2")).toBe("cafe-hospital-nr-2");
  });
});

describe("validateDataset", () => {
  it("accepts a valid dataset and summarises records", () => {
    const result = validateDataset(datasetWith(VALID_RECORD));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      id: "facility-test-general-facility-p10-5000-p13-5000",
      name: "Test General Facility",
      verified: true,
    });
  });

  it("validates the shipped example file (EXAMPLE ONLY data)", () => {
    const raw = readFileSync(resolve(import.meta.dirname, "facilities.example.json"), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const result = validateDataset(parsed);
    expect(result.valid).toBe(true);
    expect(result.records).toHaveLength(2);
    // The example file is explicitly NOT verified production data.
    expect(result.records.every((r) => r.verified === false)).toBe(true);
  });

  it("rejects a non-object dataset", () => {
    expect(validateDataset(null).valid).toBe(false);
    expect(validateDataset([VALID_RECORD]).valid).toBe(false);
    expect(validateDataset("nope").valid).toBe(false);
  });

  it("requires dataset-level provenance (meta)", () => {
    const missingCurator = validateDataset({ meta: { preparedAt: "2026-09-14" }, facilities: [] });
    expect(missingCurator.errors.some((e) => e.field === "meta.curator")).toBe(true);

    const missingMeta = validateDataset({ facilities: [] });
    expect(missingMeta.errors.some((e) => e.field === "meta")).toBe(true);
  });

  it("requires the facilities array", () => {
    const result = validateDataset({ meta: VALID_META });
    expect(result.errors.some((e) => e.field === "facilities")).toBe(true);
  });

  it("detects duplicate deterministic IDs inside one file", () => {
    const result = validateDataset(
      datasetWith(
        { ...VALID_RECORD, name: "Same Name" },
        { ...VALID_RECORD, name: "Same Name", source: "Other source (example.org), verified 2026-09-11" },
      ),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "(id)" && e.message.includes("Duplicate"))).toBe(true);
  });

  it("treats same-name different-position records as distinct, not duplicates", () => {
    const result = validateDataset(
      datasetWith(
        { ...VALID_RECORD, name: "Same Name", coordinates: { latitude: 10.5, longitude: 13.5 } },
        {
          ...VALID_RECORD,
          name: "Same Name",
          coordinates: { latitude: 10.6, longitude: 13.6 },
          source: "Other source (example.org), verified 2026-09-11",
        },
      ),
    );
    expect(result.valid).toBe(true);
    expect(new Set(result.records.map((r) => r.id)).size).toBe(2);
  });

  it("collects errors from multiple failing records with correct indices", () => {
    const result = validateDataset(
      datasetWith({ ...VALID_RECORD, name: "" }, { ...VALID_RECORD, category: "" }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.filter((e) => e.field === "name").map((e) => e.index)).toEqual([0]);
    expect(result.errors.filter((e) => e.field === "category").map((e) => e.index)).toEqual([1]);
  });

  it("warns (not fails) on taxonomy drift", () => {
    const result = validateDataset(datasetWith({ ...VALID_RECORD, category: "spa" }));
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('"spa"'))).toBe(true);
  });

  it("accepts unverified records that still carry source", () => {
    const result = validateDataset(
      datasetWith({ ...VALID_RECORD, verified: false, source: "EXAMPLE ONLY — not real data" }),
    );
    expect(result.valid).toBe(true);
    expect(result.records[0]?.verified).toBe(false);
  });
});
