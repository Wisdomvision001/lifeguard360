/**
 * Overpass query construction (Slice 1 — offline discovery core).
 *
 * Pure module: builds the deterministic Overpass QL text for a region bbox.
 * No network, no I/O, no Firebase, no imports from src/**.
 *
 * Tag union (per the approved audit):
 *   amenity=hospital | clinic | pharmacy | doctors   +   any healthcare=*
 * Query shape uses `nwr` and `out center tags;` so ways/relations yield their
 * center point and every element keeps its full tag set.
 */

/** Geographic bounding box in the project's canonical order: [south, west, north, east]. */
export type Bbox = [south: number, west: number, north: number, east: number];

export interface BboxIssue {
  field: string;
  message: string;
}

export interface BboxValidation {
  ok: boolean;
  issues: BboxIssue[];
}

const LAT_MIN = -90;
const LAT_MAX = 90;
const LON_MIN = -180;
const LON_MAX = 180;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validates a bbox in [south, west, north, east] order.
 * Rejects: missing values, non-finite values, out-of-range lat/lon,
 * south >= north and west >= east. Never reorders or repairs values.
 */
export function validateBbox(bbox: unknown): BboxValidation {
  const issues: BboxIssue[] = [];

  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return {
      ok: false,
      issues: [
        {
          field: "bbox",
          message: "bbox must be an array of exactly 4 numbers in [south, west, north, east] order.",
        },
      ],
    };
  }

  const [south, west, north, east] = bbox as unknown[];

  if (!isFiniteNumber(south)) {
    issues.push({ field: "bbox.south", message: "must be a finite number." });
    return { ok: false, issues };
  }
  if (!isFiniteNumber(west)) {
    issues.push({ field: "bbox.west", message: "must be a finite number." });
    return { ok: false, issues };
  }
  if (!isFiniteNumber(north)) {
    issues.push({ field: "bbox.north", message: "must be a finite number." });
    return { ok: false, issues };
  }
  if (!isFiniteNumber(east)) {
    issues.push({ field: "bbox.east", message: "must be a finite number." });
    return { ok: false, issues };
  }

  // All four are now narrowed to number by the early returns above.

  if (south < LAT_MIN || south > LAT_MAX) {
    issues.push({ field: "bbox.south", message: `latitude out of range (${LAT_MIN}..${LAT_MAX}).` });
  }
  if (north < LAT_MIN || north > LAT_MAX) {
    issues.push({ field: "bbox.north", message: `latitude out of range (${LAT_MIN}..${LAT_MAX}).` });
  }
  if (west < LON_MIN || west > LON_MAX) {
    issues.push({ field: "bbox.west", message: `longitude out of range (${LON_MIN}..${LON_MAX}).` });
  }
  if (east < LON_MIN || east > LON_MAX) {
    issues.push({ field: "bbox.east", message: `longitude out of range (${LON_MIN}..${LON_MAX}).` });
  }
  if (south >= north) {
    issues.push({ field: "bbox", message: "south must be strictly less than north." });
  }
  if (west >= east) {
    issues.push({ field: "bbox", message: "west must be strictly less than east." });
  }

  return { ok: issues.length === 0, issues };
}

/** The healthcare tag union the discovery query covers (approval basis for query text). */
export const DISCOVERED_TAGS: readonly string[] = [
  "amenity=hospital",
  "amenity=clinic",
  "amenity=pharmacy",
  "amenity=doctors",
  "healthcare=*",
];

/**
 * Builds the deterministic Overpass QL union query for a validated bbox.
 * Throws on an invalid bbox — callers validate first via validateBbox.
 */
export function buildOverpassQuery(bbox: Bbox): string {
  const validation = validateBbox(bbox);
  if (!validation.ok) {
    const detail = validation.issues.map((i) => `${i.field}: ${i.message}`).join(" ");
    throw new Error(`Invalid bbox — ${detail}`);
  }

  const [south, west, north, east] = bbox;
  // Coordinates rendered verbatim in canonical order; no reordering, no rounding.
  const bboxText = `${south},${west},${north},${east}`;

  return [
    "[out:json][timeout:25];",
    "(",
    `  nwr["amenity"="hospital"](${bboxText});`,
    `  nwr["amenity"="clinic"](${bboxText});`,
    `  nwr["amenity"="pharmacy"](${bboxText});`,
    `  nwr["amenity"="doctors"](${bboxText});`,
    `  nwr["healthcare"](${bboxText});`,
    ");",
    "out center tags;",
  ].join("\n");
}
