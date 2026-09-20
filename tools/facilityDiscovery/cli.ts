/**
 * Facility discovery CLI (Slice 2).
 *
 * Orchestrates: config → query (pure core) → Overpass (network layer) →
 * parse → dedupe → compare → atomic artifact output. Preparation tooling
 * ONLY: no Firebase, no application-service imports, no writes outside
 * tools/discovery/<region>/, nothing is ever auto-verified or auto-promoted.
 *
 * Usage:
 *   npm run discover:facilities -- --region yola-jimeta [--dry-run]
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  collapseExactIdentity,
  flagDuplicates,
  type CandidateLike,
  type DuplicateFlag,
} from "./dedupe.ts";
import {
  compareWithCurated,
  type CandidateView,
  type ComparisonFinding,
  type CuratedRecordView,
} from "./compare.ts";
import {
  candidateSchema,
  parseOverpassResponse,
  type Candidate,
  type DiscoveryMeta,
} from "./parse.ts";
import { facilityDocumentId } from "../facilityValidation.ts";
import { validateBbox, type Bbox } from "./query.ts";
import {
  fetchOverpassResponse,
  summarizePayload,
  USER_AGENT,
} from "./overpass.ts";

export const TOOL_VERSION = "0.2.0";
export const QUERY_REF = "medical-v1";
/** Root output directory — the ONLY location this CLI may write. */
export const DISCOVERY_ROOT = "tools/discovery";
/** Curated dataset: strictly a READ-ONLY comparison input. */
export const CURATED_DATASET_PATH = "tools/facilities.yola.json";
/** Test-only override for the output root (redirects writes into temp dirs). */
export const TEST_OUTPUT_ROOT_ENV = "LIFEGUARD360_DISCOVERY_OUTPUT_ROOT";

export interface CliError {
  kind: "unknown-region" | "invalid-bbox" | "usage" | "overpass" | "io";
  message: string;
  status?: number;
}

function fail(kind: CliError["kind"], message: string, status?: number): never {
  throw { kind, message, status } satisfies CliError;
}

export interface DiscoveryConfigShape {
  regions: Record<string, { bbox: unknown; justification?: string }>;
  overpass: { endpoint: string; timeoutMs: number; retries: number };
}

/** Loads and shape-checks the checked-in discovery config. */
export function loadDiscoveryConfig(configPath: string): DiscoveryConfigShape {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (cause) {
    fail("usage", `Cannot read discovery config at ${configPath}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  const root = parsed as Partial<DiscoveryConfigShape> | null;
  if (
    root === null ||
    typeof root !== "object" ||
    root.regions === undefined ||
    root.regions === null ||
    typeof root.regions !== "object" ||
    root.overpass === undefined ||
    root.overpass === null ||
    typeof root.overpass !== "object" ||
    typeof root.overpass.endpoint !== "string" ||
    root.overpass.endpoint === "" ||
    typeof root.overpass.timeoutMs !== "number" ||
    !Number.isFinite(root.overpass.timeoutMs) ||
    root.overpass.timeoutMs <= 0 ||
    typeof root.overpass.retries !== "number" ||
    !Number.isInteger(root.overpass.retries) ||
    root.overpass.retries < 0
  ) {
    fail("usage", "Discovery config is malformed: requires regions{} and overpass { endpoint, timeoutMs, retries }.");
  }
  return root as DiscoveryConfigShape;
}

/** Resolves a region name to a validated bbox — regions come ONLY from the config. */
export function resolveRegion(
  config: DiscoveryConfigShape,
  regionName: string,
): { name: string; bbox: Bbox; justification?: string } {
  const entry = config.regions[regionName];
  if (entry === undefined) {
    const known = Object.keys(config.regions).join(", ");
    fail("unknown-region", `Unknown region "${regionName}". Known regions: ${known || "(none)"}.`);
  }
  const validation = validateBbox(entry.bbox);
  if (!validation.ok) {
    const detail = validation.issues.map((i) => `${i.field}: ${i.message}`).join(" ");
    fail("invalid-bbox", `Region "${regionName}" has an invalid bbox — ${detail}`);
  }
  return { name: regionName, bbox: entry.bbox as Bbox, justification: entry.justification };
}

/** Parses CLI arguments: --region <name> [--dry-run]. Unknown flags are rejected. */
export function parseArgs(argv: readonly string[]): { region: string; dryRun: boolean } {
  let region: string | null = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--region") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        fail("usage", "--region requires a value. Usage: --region <name> [--dry-run]");
      }
      region = value;
      i++;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else {
      fail("usage", `Unknown argument "${arg}". Usage: --region <name> [--dry-run]`);
    }
  }
  if (region === null || region.trim() === "") {
    fail("usage", "Missing required --region argument. Usage: --region <name> [--dry-run]");
  }
  return { region, dryRun };
}

/** Defensively rejects region names that could traverse paths. */
export function isSafeRegionName(region: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(region) && !region.includes("..");
}

/** --- Output artifact shapes ---------------------------------------------- */

export interface ComparisonSummary {
  knownExact: number;
  knownProbable: number;
  newCount: number;
  changedInfo: number;
}

/** Candidate plus its advisory comparison annotation. Still NOT a facility. */
export interface AnnotatedCandidate {
  candidateId: string;
  osm: { type: string; id: number; url: string; version: number | null };
  name: string | null;
  coordinates: { latitude: number; longitude: number };
  addressRaw: Record<string, string> | null;
  addressCandidate: string | null;
  phone: string | null;
  openingHours: string | null;
  operator: string | null;
  tags: Record<string, string>;
  categorySuggestion: string;
  source: string;
  discovery: DiscoveryMeta;
  comparison: {
    status: ComparisonFinding["status"];
    matchedDocumentId: string | null;
    changedFields: string[];
    reason: string;
  };
}

export interface RunArtifact {
  toolVersion: string;
  region: string;
  bbox: Bbox;
  endpoint: string;
  queryRef: string;
  retrievedAt: string;
  request: {
    method: "POST";
    userAgent: string;
    timeoutMs: number;
    retries: number;
    attempts: number;
    bytes: number;
  };
  totals: {
    totalElements: number;
    validCandidates: number;
    skipped: number;
    duplicateFlags: number;
  };
  comparisonCounts: ComparisonSummary;
  errors: { skipped: { osmType: string | null; osmId: number | null; reason: string }[] };
}

export interface AnalysisOutput {
  candidates: AnnotatedCandidate[];
  duplicates: { flags: DuplicateFlag[] };
  run: RunArtifact;
}

/** Loads the curated dataset as read-only comparison views. */
export function loadCuratedViews(curatedPath: string): CuratedRecordView[] {
  const dataset = JSON.parse(readFileSync(curatedPath, "utf8")) as {
    facilities?: {
      name?: unknown;
      coordinates?: { latitude?: unknown; longitude?: unknown };
      phone?: unknown;
      openingHours?: unknown;
      address?: unknown;
      source?: unknown;
    }[];
  };
  const facilities = Array.isArray(dataset.facilities) ? dataset.facilities : [];
  const views: CuratedRecordView[] = [];
  for (const facility of facilities) {
    if (typeof facility.name !== "string" || facility.coordinates === null || typeof facility.coordinates !== "object") {
      continue;
    }
    const latitude = facility.coordinates.latitude;
    const longitude = facility.coordinates.longitude;
    if (typeof latitude !== "number" || typeof longitude !== "number") continue;
    views.push({
      name: facility.name,
      coordinates: { latitude, longitude },
      phone: typeof facility.phone === "string" ? facility.phone : undefined,
      openingHours: typeof facility.openingHours === "string" ? facility.openingHours : undefined,
      address: typeof facility.address === "string" ? facility.address : undefined,
      source: typeof facility.source === "string" ? facility.source : "",
    });
  }
  return views;
}

/** Converts core candidates into comparison views (adds the deterministic id). */
function toCandidateViews(candidates: readonly Candidate[]): CandidateView[] {
  return candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    name: candidate.name,
    coordinates: candidate.coordinates,
    phone: candidate.phone,
    openingHours: candidate.openingHours,
    addressCandidate: candidate.addressCandidate,
    osmType: candidate.osm.type,
    osmId: candidate.osm.id,
    documentId: candidate.name === null ? undefined : facilityDocumentId(candidate.name, candidate.coordinates),
  }));
}

function countFindings(findings: readonly ComparisonFinding[]): ComparisonSummary {
  const summary: ComparisonSummary = { knownExact: 0, knownProbable: 0, newCount: 0, changedInfo: 0 };
  for (const finding of findings) {
    if (finding.status === "KNOWN_EXACT") summary.knownExact += 1;
    else if (finding.status === "KNOWN_PROBABLE") summary.knownProbable += 1;
    else if (finding.status === "CHANGED_INFO") summary.changedInfo += 1;
    else summary.newCount += 1;
  }
  return summary;
}

/**
 * Builds all three artifacts from a parsed payload — pure except reading the
 * curated comparison input. Output ordering is deterministic: candidates and
 * flags are sorted by id, reasons are stable.
 */
export function buildAnalysis(payload: unknown, discovery: DiscoveryMeta, curatedPath: string, request: RunArtifact["request"]): AnalysisOutput {
  const { candidates, skipped } = parseOverpassResponse(payload, discovery);

  const identity = collapseExactIdentity(candidates as unknown as CandidateLike[]);
  const canonicalCandidates = identity.canonical as unknown as Candidate[];
  const duplicateFlags: DuplicateFlag[] = [...identity.flags, ...flagDuplicates(identity.canonical)];

  const curatedViews = loadCuratedViews(curatedPath);
  const findings = compareWithCurated(toCandidateViews(canonicalCandidates), curatedViews);
  const findingByCandidateId = new Map(findings.map((finding) => [finding.candidateId, finding]));

  const annotated: AnnotatedCandidate[] = canonicalCandidates.map((candidate) => {
    const parsed = candidateSchema.parse(candidate);
    const finding = findingByCandidateId.get(candidate.candidateId);
    return {
      ...parsed,
      comparison: {
        status: finding?.status ?? "NEW",
        matchedDocumentId: finding?.matchedDocumentId ?? null,
        changedFields: finding?.changedFields ?? [],
        reason: finding?.reason ?? "no curated record matches this candidate",
      },
    };
  });
  annotated.sort((a, b) => (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0));

  const sortedFlags = [...duplicateFlags].sort((a, b) => {
    if (a.type !== b.type) return a.type < b.type ? -1 : 1;
    if (a.candidateAId !== b.candidateAId) return a.candidateAId < b.candidateAId ? -1 : 1;
    return a.candidateBId < b.candidateBId ? -1 : a.candidateBId > b.candidateBId ? 1 : 0;
  });

  const { totalElements } = summarizePayload(payload);
  const run: RunArtifact = {
    toolVersion: TOOL_VERSION,
    region: discovery.region,
    bbox: discovery.bbox,
    endpoint: discovery.endpoint,
    queryRef: discovery.queryRef,
    retrievedAt: discovery.retrievedAt,
    request,
    totals: {
      totalElements,
      validCandidates: annotated.length,
      skipped: skipped.length,
      duplicateFlags: sortedFlags.length,
    },
    comparisonCounts: countFindings(findings),
    errors: { skipped },
  };

  return { candidates: annotated, duplicates: { flags: sortedFlags }, run };
}

/** Serializes with stable formatting (2-space JSON, trailing newline). */
function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Writes the three artifacts atomically-in-effect: everything is serialized
 * BEFORE any filesystem mutation, then each file is written. A failure in
 * earlier stages never touches existing outputs.
 */
export function writeOutputs(outputDir: string, analysis: AnalysisOutput): string[] {
  const candidatesJson = serialize(analysis.candidates);
  const duplicatesJson = serialize(analysis.duplicates);
  const runJson = serialize(analysis.run);
  mkdirSync(outputDir, { recursive: true });
  const files: [string, string][] = [
    ["candidates.json", candidatesJson],
    ["duplicates.json", duplicatesJson],
    ["_run.json", runJson],
  ];
  for (const [name, content] of files) {
    writeFileSync(resolve(outputDir, name), content, "utf8");
  }
  return files.map(([name]) => resolve(outputDir, name));
}

/** Concise human summary (never the full dataset). */
export function printSummary(analysis: AnalysisOutput, outputDir: string | null): void {
  const run = analysis.run;
  const lines = [
    "Lifeguard360 facility discovery — preparation run (candidates are NOT verified facilities)",
    `Region: ${run.region}`,
    `Overpass elements: ${run.totals.totalElements}`,
    `Valid candidates: ${run.totals.validCandidates}`,
    `Skipped: ${run.totals.skipped}`,
    `Duplicate flags: ${run.totals.duplicateFlags}`,
    `Known exact: ${run.comparisonCounts.knownExact}`,
    `Known probable: ${run.comparisonCounts.knownProbable}`,
    `New: ${run.comparisonCounts.newCount}`,
    `Changed info: ${run.comparisonCounts.changedInfo}`,
  ];
  if (outputDir !== null) lines.push(`Output: ${outputDir}`);
  else lines.push("Dry-run: no output files written");
  for (const line of lines) console.log(line);
}

export interface RunCliDeps {
  configPath?: string;
  curatedPath?: string;
  fetchFn?: typeof fetch;
  delayFn?: (ms: number) => Promise<void>;
}

/**
 * Entry point. Returns the process exit code. Network failures, unknown
 * regions, and invalid usage exit non-zero WITHOUT writing any output.
 */
export async function runCli(argv: readonly string[], deps: RunCliDeps = {}): Promise<number> {
  let args: { region: string; dryRun: boolean };
  let config: DiscoveryConfigShape;
  let region: { name: string; bbox: Bbox };
  try {
    args = parseArgs(argv);
    config = loadDiscoveryConfig(deps.configPath ?? "tools/discoveryConfig.json");
    region = resolveRegion(config, args.region);
  } catch (caught) {
    const error = caught as CliError;
    console.error(`ERROR (${error.kind}): ${error.message}`);
    return 2;
  }

  if (!isSafeRegionName(region.name)) {
    console.error(`ERROR (usage): region name "${region.name}" contains unsupported characters.`);
    return 2;
  }

  const retrievedAt = new Date().toISOString();
  const discovery: DiscoveryMeta = {
    region: region.name,
    bbox: region.bbox,
    endpoint: config.overpass.endpoint,
    queryRef: QUERY_REF,
    retrievedAt,
  };

  const result = await fetchOverpassResponse(region.bbox, config.overpass, {
    fetchFn: deps.fetchFn,
    delayFn: deps.delayFn,
  });
  if (!result.ok) {
    const error = result.error;
    console.error(`ERROR (overpass/${error.kind}): ${error.message}`);
    return 1;
  }

  let analysis: AnalysisOutput;
  try {
    analysis = buildAnalysis(
      result.data,
      discovery,
      deps.curatedPath ?? CURATED_DATASET_PATH,
      {
        method: "POST",
        userAgent: USER_AGENT,
        timeoutMs: config.overpass.timeoutMs,
        retries: config.overpass.retries,
        attempts: result.attempt,
        bytes: result.bytes,
      },
    );
  } catch (cause) {
    console.error(`ERROR (analysis): ${cause instanceof Error ? cause.message : String(cause)}`);
    return 1;
  }

  if (args.dryRun) {
    printSummary(analysis, null);
    return 0;
  }

  const outputRoot = process.env[TEST_OUTPUT_ROOT_ENV] ?? DISCOVERY_ROOT;
  const outputDir = resolve(outputRoot, region.name);
  let written: string[];
  try {
    written = writeOutputs(outputDir, analysis);
  } catch (cause) {
    console.error(`ERROR (io): could not write discovery output: ${cause instanceof Error ? cause.message : String(cause)}`);
    return 1;
  }

  printSummary(analysis, outputDir);
  console.log(`Files: ${written.map((path) => path.split(/[\\/]/).slice(-2).join("/")).join(", ")}`);
  return 0;
}

/** Main guard: executed directly vs imported (tests import runCli directly). */
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((cause: unknown) => {
      console.error(`UNEXPECTED ERROR: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}`);
      process.exitCode = 1;
    });
}
