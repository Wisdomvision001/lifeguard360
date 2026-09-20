/**
 * Overpass response parsing (Slice 1 — offline discovery core).
 *
 * Pure module: converts an Overpass JSON response into candidate records plus
 * structured skip reasons. No network, no I/O, no Firebase, no src/** imports.
 *
 * Contract notes (per the approved audit):
 * - Candidates NEVER carry `verified` — verification belongs to human curation.
 * - Names/phones/hours are preserved verbatim; nothing is normalized here.
 * - Missing data becomes null, never an invented value.
 * - One malformed element never fails the whole run: it is skipped with a reason.
 */

import { z } from "zod";

import { composeAddressCandidate, extractAddressRaw } from "./address.ts";
import { PRESERVED_TAG_KEYS, suggestCategory } from "./categories.ts";

export type OsmElementType = "node" | "way" | "relation";

/** Zod schema for a discovery candidate (no `verified` field by design). */
export const candidateSchema = z.object({
  candidateId: z.string().min(1),
  osm: z.object({
    type: z.enum(["node", "way", "relation"]),
    id: z.number().int().positive(),
    url: z.string().min(1),
    version: z.number().int().positive().nullable(),
  }),
  name: z.string().nullable(),
  coordinates: z.object({
    latitude: z.number().finite(),
    longitude: z.number().finite(),
  }),
  addressRaw: z.record(z.string(), z.string()).nullable(),
  addressCandidate: z.string().nullable(),
  phone: z.string().nullable(),
  openingHours: z.string().nullable(),
  operator: z.string().nullable(),
  tags: z.record(z.string(), z.string()),
  categorySuggestion: z.enum(["hospital", "clinic", "pharmacy", "health-centre", "unknown"]),
  source: z.string().min(1),
  discovery: z.object({
    region: z.string().min(1),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    endpoint: z.string().min(1),
    queryRef: z.string().min(1),
    retrievedAt: z.string().min(1),
  }),
});

export type Candidate = z.infer<typeof candidateSchema>;

/** Caller-supplied discovery metadata (offline core does not fetch or clock anything). */
export interface DiscoveryMeta {
  region: string;
  bbox: [number, number, number, number];
  endpoint: string;
  queryRef: string;
  retrievedAt: string;
}

export interface SkipReason {
  osmType: string | null;
  osmId: number | null;
  reason: string;
}

export interface ParseResult {
  candidates: Candidate[];
  skipped: SkipReason[];
}

/** Keys preserved verbatim on every candidate (superset: addr:* handled separately). */
function preserveTags(tags: Record<string, unknown>): Record<string, string> {
  const preserved: Record<string, string> = {};
  for (const key of PRESERVED_TAG_KEYS) {
    const value = tags[key];
    if (typeof value === "string" && value !== "") preserved[key] = value;
  }
  return preserved;
}

/** Verbatim phone: `phone` first, `contact:phone` as fallback. Never normalized. */
function extractPhone(tags: Record<string, unknown>): string | null {
  const primary = tags["phone"];
  if (typeof primary === "string" && primary.trim() !== "") return primary;
  const fallback = tags["contact:phone"];
  if (typeof fallback === "string" && fallback.trim() !== "") return fallback;
  return null;
}

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

/** Coordinate extraction: node lat/lon; way/relation center.lat/center.lon. */
function extractCoordinates(element: Record<string, unknown>): { latitude: number; longitude: number } | null {
  const lat = element.lat;
  const lon = element.lon;
  if (typeof lat === "number" && typeof lon === "number") return { latitude: lat, longitude: lon };

  const center = element.center;
  if (center !== null && typeof center === "object") {
    const c = center as Record<string, unknown>;
    const clat = c.lat;
    const clon = c.lon;
    if (typeof clat === "number" && typeof clon === "number") return { latitude: clat, longitude: clon };
  }
  return null;
}

function isValidCoordinates(coordinates: { latitude: number; longitude: number }): boolean {
  return (
    Number.isFinite(coordinates.latitude) &&
    coordinates.latitude >= -90 &&
    coordinates.latitude <= 90 &&
    Number.isFinite(coordinates.longitude) &&
    coordinates.longitude >= -180 &&
    coordinates.longitude <= 180
  );
}

/**
 * Parses an Overpass JSON response into candidates + structured skips.
 * Throws only when the response itself is not a parseable Overpass document;
 * individual malformed elements are skipped with reasons instead.
 */
export function parseOverpassResponse(payload: unknown, discovery: DiscoveryMeta): ParseResult {
  if (payload === null || typeof payload !== "object") {
    throw new Error("Overpass response is not a JSON object.");
  }
  const root = payload as Record<string, unknown>;
  const elements = root.elements;
  if (!Array.isArray(elements)) {
    throw new Error('Overpass response has no "elements" array.');
  }

  const candidates: Candidate[] = [];
  const skipped: SkipReason[] = [];

  for (const entry of elements) {
    if (entry === null || typeof entry !== "object") {
      skipped.push({ osmType: null, osmId: null, reason: "element is not an object" });
      continue;
    }
    const element = entry as Record<string, unknown>;

    const type = element.type;
    const id = element.id;
    if (typeof type !== "string" || (type !== "node" && type !== "way" && type !== "relation")) {
      skipped.push({ osmType: typeof type === "string" ? type : null, osmId: null, reason: "unsupported or missing element type" });
      continue;
    }
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
      skipped.push({ osmType: type, osmId: null, reason: "missing or invalid OSM id" });
      continue;
    }

    const coordinates = extractCoordinates(element);
    if (coordinates === null) {
      skipped.push({ osmType: type, osmId: id, reason: "missing coordinates (no lat/lon and no center)" });
      continue;
    }
    if (!isValidCoordinates(coordinates)) {
      skipped.push({ osmType: type, osmId: id, reason: "malformed or out-of-range coordinates" });
      continue;
    }

    const tags =
      element.tags !== null && typeof element.tags === "object" ? (element.tags as Record<string, unknown>) : {};

    const name = firstString([tags.name]);
    const addressRaw = extractAddressRaw(tags);
    const candidate: Candidate = {
      candidateId: `osm-${type}-${id}`,
      osm: {
        type,
        id,
        url: `https://www.openstreetmap.org/${type}/${id}`,
        version: typeof element.version === "number" && Number.isInteger(element.version) && element.version > 0 ? element.version : null,
      },
      name,
      coordinates,
      addressRaw,
      addressCandidate: composeAddressCandidate(tags),
      phone: extractPhone(tags),
      openingHours: firstString([tags["opening_hours"]]),
      operator: firstString([tags.operator]),
      tags: preserveTags(tags),
      categorySuggestion: suggestCategory(tags),
      source: "OpenStreetMap via Overpass API (discovery candidate — unverified, pending human review)",
      discovery: {
        region: discovery.region,
        bbox: discovery.bbox,
        endpoint: discovery.endpoint,
        queryRef: discovery.queryRef,
        retrievedAt: discovery.retrievedAt,
      },
    };

    const parsed = candidateSchema.safeParse(candidate);
    if (!parsed.success) {
      skipped.push({ osmType: type, osmId: id, reason: `candidate failed schema validation: ${parsed.error.issues[0]?.message ?? "unknown"}` });
      continue;
    }
    candidates.push(parsed.data);
  }

  return { candidates, skipped };
}
