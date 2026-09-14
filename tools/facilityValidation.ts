/**
 * Facility dataset validation (Phase 5D-2) — the integrity layer that Firestore
 * rules cannot provide for the `facilities` collection (public read, no client
 * writes; all writes go through the Admin SDK, which bypasses rules).
 *
 * Pure functions only: no SDK imports, no I/O, no mutation of input data.
 * Validation never repairs, normalizes into existence, or invents anything —
 * a record either satisfies the contract (docs/DATASET-CONTRACT.md) or it is
 * reported as invalid with a structured, human-readable reason.
 */

/** The exact record shape consumed by facilityService (see contract §1).
 *  Deliberately identical to the approved Facility schema — the import input
 *  introduces NO extra fields (e.g. no ID-helper field). */
export interface FacilityRecordInput {
  name: string;
  category: string;
  coordinates: { latitude: number; longitude: number };
  verified: boolean;
  /** Provenance string; required for every record (contract §5). */
  source: string;
  /** ISO 8601 timestamp of last verification/update. */
  updatedAt: string;
  phone?: string;
  openingHours?: string;
}

export interface DatasetMeta {
  /** Who curated this dataset (required provenance at dataset level). */
  curator: string;
  /** ISO 8601 date the dataset was prepared. */
  preparedAt: string;
  /** Overall source statement for the dataset. */
  note?: string;
}

export interface DatasetInput {
  meta: DatasetMeta;
  facilities: FacilityRecordInput[];
}

export interface ValidationError {
  /** Zero-based index of the failing record in the input array. */
  index: number;
  /** Deterministic document ID when one could be derived, else null. */
  id: string | null;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  /** Warnings do not block the import (e.g. taxonomy drift). */
  warnings: string[];
  /** One entry per record, in input order, for the dry-run summary. */
  records: { index: number; id: string; name: string; verified: boolean }[];
}

const PHONE_PATTERN = /^\+[0-9]{8,15}$/;
const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?)?$/;

/** Shape check AND real-calendar validity (2026-13-40 is not a date). */
function isValidIso8601(value: string): boolean {
  if (!ISO_8601_PATTERN.test(value.trim())) return false;
  return !Number.isNaN(Date.parse(value.trim()));
}

/** Known category taxonomy (contract §6). Outside values warn, not fail. */
export const KNOWN_CATEGORIES: readonly string[] = [
  "hospital",
  "clinic",
  "pharmacy",
  "health-centre",
];

/**
 * Slugify per contract §7: lowercase, trim, ASCII-fold common diacritics,
 * drop joiner punctuation (apostrophes — so "Luke's" → "lukes", not
 * "luke-s"), collapse remaining non-alphanumeric runs to `-`, trim `-`.
 */
export function slug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Format a coordinate for the deterministic ID: sign-safe ("n"/"p" prefix so
 * +9.2345 and −9.2345 never collide), rounded to 4 decimals (~11 m — facility
 * placement precision, stable under re-import precision differences).
 */
function formatCoordComponent(value: number): string {
  const rounded = Math.abs(value).toFixed(4).replace(".", "-").replace(/-0+$/, "");
  return `${value < 0 ? "n" : "p"}${rounded}`;
}

/**
 * Deterministic document ID (contract §7), built ONLY from approved-schema
 * fields: normalized name + rounded coordinates. Stable between imports, so
 * re-imports update in place instead of duplicating. Never random. Different
 * branches of a same-named chain get different IDs via their coordinates;
 * two records with the same name AND the same rounded position are a true
 * duplicate the curator must resolve deliberately.
 */
export function facilityDocumentId(
  name: string,
  coordinates: { latitude: number; longitude: number },
): string {
  return `facility-${slug(name)}-${formatCoordComponent(coordinates.latitude)}-${formatCoordComponent(coordinates.longitude)}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** A verification date must be extractable from provenance for verified records. */
function provenanceHasVerificationDate(source: string): boolean {
  return /\bverified\s+\d{4}-\d{2}-\d{2}\b/i.test(source) || isValidIso8601(source);
}

/** Validate one record against the contract. Returns the list of violations. */
export function validateFacilityRecord(
  record: unknown,
  index: number,
): { id: string | null; name: string; verified: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const push = (field: string, message: string): void => {
    errors.push({ index, id: null, field, message });
  };

  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    push("(record)", "Record must be a JSON object.");
    return { id: null, name: "", verified: false, errors };
  }
  const r = record as Record<string, unknown>;

  // ---- required scalar fields --------------------------------------------
  if (!isNonEmptyString(r.name)) push("name", "Required non-empty string.");
  if (!isNonEmptyString(r.category)) push("category", "Required non-empty string.");
  if (typeof r.verified !== "boolean") push("verified", "Required boolean.");

  const verified = r.verified === true;

  // ---- coordinates --------------------------------------------------------
  const coords = r.coordinates as Record<string, unknown> | undefined;
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (coords === null || typeof coords !== "object" || Array.isArray(coords)) {
    push("coordinates", "Required object with latitude and longitude.");
  } else {
    const { latitude: lat, longitude: lng } = coords as Record<string, unknown>;
    if (!isFiniteNumber(lat)) push("coordinates.latitude", "Required finite number.");
    else if (lat < -90 || lat > 90) push("coordinates.latitude", `Out of range: ${lat} (must be −90…90).`);
    else latitude = lat;

    if (!isFiniteNumber(lng)) push("coordinates.longitude", "Required finite number.");
    else if (lng < -180 || lng > 180) push("coordinates.longitude", `Out of range: ${lng} (must be −180…180).`);
    else longitude = lng;

    if (latitude === 0 && longitude === 0) {
      push("coordinates", "0,0 is the no-data sentinel and is rejected (contract §2).");
    }
  }

  // ---- provenance / verification metadata ---------------------------------
  if (!isNonEmptyString(r.source)) {
    push("source", "Required provenance string for every record (contract §5).");
  } else if (verified && !provenanceHasVerificationDate(r.source)) {
    push(
      "source",
      'Verified records must carry a verification date in provenance, e.g. "…, verified 2026-09-10".',
    );
  }

  if (!isNonEmptyString(r.updatedAt) || !isValidIso8601(r.updatedAt)) {
    push("updatedAt", "Required ISO 8601 timestamp of last verification/update.");
  }

  // ---- optional fields ------------------------------------------------------
  if (r.phone !== undefined && (!isNonEmptyString(r.phone) || !PHONE_PATTERN.test(r.phone))) {
    push("phone", `Must be E.164-style (+digits), e.g. +2348012345678. Got: ${JSON.stringify(r.phone ?? null)}`);
  }
  if (r.openingHours !== undefined && !isNonEmptyString(r.openingHours)) {
    push("openingHours", "When present, must be a non-empty string.");
  }

  const id =
    isNonEmptyString(r.name) && latitude !== null && longitude !== null
      ? facilityDocumentId(r.name, { latitude, longitude })
      : null;

  return { id, name: isNonEmptyString(r.name) ? r.name : "", verified, errors };
}

/** Validate a whole dataset file: structure, meta provenance, records, duplicates. */
export function validateDataset(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return {
      valid: false,
      errors: [{ index: -1, id: null, field: "(file)", message: "Dataset must be a JSON object." }],
      warnings,
      records: [],
    };
  }
  const dataset = input as Record<string, unknown>;

  const meta = dataset.meta as Record<string, unknown> | undefined;
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) {
    errors.push({ index: -1, id: null, field: "meta", message: "Required object with curator and preparedAt." });
  } else {
    if (!isNonEmptyString(meta.curator)) {
      errors.push({ index: -1, id: null, field: "meta.curator", message: "Required dataset-level provenance." });
    }
    if (!isNonEmptyString(meta.preparedAt) || !isValidIso8601(String(meta.preparedAt))) {
      errors.push({ index: -1, id: null, field: "meta.preparedAt", message: "Required ISO 8601 date." });
    }
  }

  if (!Array.isArray(dataset.facilities)) {
    errors.push({ index: -1, id: null, field: "facilities", message: "Required array of facility records." });
    return { valid: false, errors, warnings, records: [] };
  }

  const records: ValidationResult["records"] = [];
  const seenIds = new Map<string, number>();

  dataset.facilities.forEach((record, index) => {
    const result = validateFacilityRecord(record, index);
    errors.push(...result.errors);

    if (result.id !== null) {
      const firstIndex = seenIds.get(result.id);
      if (firstIndex !== undefined) {
        errors.push({
          index,
          id: result.id,
          field: "(id)",
          message: `Duplicate deterministic ID "${result.id}" — also generated for record ${firstIndex}.`,
        });
      } else {
        seenIds.set(result.id, index);
      }
    }

    if (isNonEmptyString((record as Record<string, unknown>).category)) {
      const category = String((record as Record<string, unknown>).category);
      if (!KNOWN_CATEGORIES.includes(category)) {
        warnings.push(`Record ${index} (${result.name || "unnamed"}): category "${category}" is outside the known taxonomy (${KNOWN_CATEGORIES.join(", ")}).`);
      }
    }

    records.push({ index, id: result.id ?? "(invalid)", name: result.name, verified: result.verified });
  });

  return { valid: errors.length === 0, errors, warnings, records };
}
