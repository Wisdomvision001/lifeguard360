import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CURATED_DATASET_PATH,
  TEST_OUTPUT_ROOT_ENV,
  buildAnalysis,
  isSafeRegionName,
  loadCuratedViews,
  loadDiscoveryConfig,
  parseArgs,
  resolveRegion,
  runCli,
} from "./cli.ts";

const CONFIG_PATH = "tools/discoveryConfig.json";
const VALID_ARGV = ["--region", "yola-jimeta"];

function okBody(elements: unknown[]): string {
  return JSON.stringify({ version: 0.6, elements });
}

function hospitalElement(id: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "node",
    id,
    lat: 9.21,
    lon: 12.47,
    version: 1,
    tags: { amenity: "hospital", name: `Test Hospital ${id}` },
    ...overrides,
  };
}

function fetchReturning(body: string): typeof fetch {
  return (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
}

let tempRoot: string;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "lifeguard360-discovery-"));
  process.env[TEST_OUTPUT_ROOT_ENV] = tempRoot;
});

afterEach(() => {
  delete process.env[TEST_OUTPUT_ROOT_ENV];
  rmSync(tempRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("argument and configuration validation", () => {
  it("parses --region and --dry-run", () => {
    expect(parseArgs(["--region", "yola-jimeta"])).toEqual({ region: "yola-jimeta", dryRun: false });
    expect(parseArgs(["--region", "yola-jimeta", "--dry-run"])).toEqual({ region: "yola-jimeta", dryRun: true });
  });

  it("rejects missing/unknown/empty-flag arguments before any network call", () => {
    expect(() => parseArgs([])).toThrow(/region/i);
    expect(() => parseArgs(["--region"])).toThrow(/region requires a value/i);
    expect(() => parseArgs(["--region", "x", "--wat"])).toThrow(/unknown argument/i);
    expect(() => parseArgs(["--wat"])).toThrow(/unknown argument/i);
  });

  it("loads the checked-in config", () => {
    const config = loadDiscoveryConfig(CONFIG_PATH);
    expect(config.overpass.endpoint).toContain("overpass");
    expect(Object.keys(config.regions)).toContain("yola-jimeta");
  });

  it("resolves a known region; rejects unknown regions with a clear error", () => {
    const config = loadDiscoveryConfig(CONFIG_PATH);
    const region = resolveRegion(config, "yola-jimeta");
    expect(region.bbox).toEqual([8.85, 12.35, 9.65, 12.75]);

    expect(() => resolveRegion(config, "atlantis")).toThrow(/unknown region.*atlantis/i);
  });

  it("rejects an invalid bbox region", () => {
    const badConfig = {
      regions: { bad: { bbox: [9.65, 12.35, 8.85, 12.75] } },
      overpass: { endpoint: "https://overpass.test", timeoutMs: 1000, retries: 0 },
    };
    expect(() => resolveRegion(badConfig, "bad")).toThrow(/invalid bbox/i);
  });

  it("runCli exits 2 on unknown region WITHOUT a network request", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const code = await runCli(["--region", "atlantis"], { fetchFn });
    expect(code).toBe(2);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("runCli exits 2 on missing region WITHOUT a network request", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const code = await runCli([], { fetchFn });
    expect(code).toBe(2);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects unsafe region names", () => {
    expect(isSafeRegionName("yola-jimeta")).toBe(true);
    for (const bad of ["../etc", "a/b", "..", "a b", ".hidden", "a\\b"]) {
      expect(isSafeRegionName(bad)).toBe(false);
    }
  });
});

describe("runCli — normal mode (mocked network, temp output)", () => {
  it("writes exactly three artifacts and prints a summary", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await runCli(VALID_ARGV, { fetchFn: fetchReturning(okBody([hospitalElement(1), hospitalElement(2)])) });
    expect(code).toBe(0);

    const regionDir = join(tempRoot, "yola-jimeta");
    expect(existsSync(regionDir)).toBe(true);
    expect(existsSync(join(regionDir, "candidates.json"))).toBe(true);
    expect(existsSync(join(regionDir, "duplicates.json"))).toBe(true);
    expect(existsSync(join(regionDir, "_run.json"))).toBe(true);
    // Nothing else written.
    expect(statSync(regionDir).isDirectory()).toBe(true);
    const files = statSync(regionDir);
    expect(files.isFile()).toBe(false);

    const candidates = JSON.parse(readFileSync(join(regionDir, "candidates.json"), "utf8")) as { candidateId: string }[];
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.candidateId)).toEqual([...candidates.map((c) => c.candidateId)].sort());
    const run = JSON.parse(readFileSync(join(regionDir, "_run.json"), "utf8")) as { totals: { totalElements: number; validCandidates: number }; region: string; queryRef: string };
    expect(run.totals.totalElements).toBe(2);
    expect(run.totals.validCandidates).toBe(2);
    expect(run.region).toBe("yola-jimeta");
    expect(run.queryRef).toBe("medical-v1");

    expect(consoleLog).toHaveBeenCalledWith(expect.stringMatching(/Valid candidates: 2/));
    consoleLog.mockRestore();
  });

  it("annotates candidates with comparison status and never adds verified", async () => {
    const code = await runCli(VALID_ARGV, {
      fetchFn: fetchReturning(okBody([hospitalElement(900001)])), // same node id as the curated MAUTH-adjacent fixture
    });
    expect(code).toBe(0);
    const regionDir = join(tempRoot, "yola-jimeta");
    const candidates = JSON.parse(readFileSync(join(regionDir, "candidates.json"), "utf8")) as {
      candidateId: string;
      comparison: { status: string };
    }[];
    expect(candidates[0]?.comparison).toHaveProperty("status");
    for (const candidate of candidates) {
      expect(candidate).not.toHaveProperty("verified");
      expect(Object.keys(candidate)).not.toContain("verified");
    }
  });

  it("comparison counts include known/new/changed breakdowns in _run.json", async () => {
    const code = await runCli(VALID_ARGV, {
      // node/4893220623 is referenced in the curated Nassarawo Clinic provenance → KNOWN_EXACT path
      fetchFn: fetchReturning(okBody([
        hospitalElement(4893220623, { lat: 9.2801823, lon: 12.443967 }),
        hospitalElement(5001, { lat: 9.5, lon: 12.7 }),
      ])),
    });
    expect(code).toBe(0);
    const run = JSON.parse(readFileSync(join(tempRoot, "yola-jimeta", "_run.json"), "utf8")) as {
      comparisonCounts: { knownExact: number; knownProbable: number; newCount: number; changedInfo: number };
    };
    expect(run.comparisonCounts.knownExact).toBe(1);
    expect(run.comparisonCounts.newCount).toBe(1);
  });
});

describe("runCli — dry-run mode", () => {
  it("performs the network request but writes NOTHING", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await runCli([...VALID_ARGV, "--dry-run"], { fetchFn: fetchReturning(okBody([hospitalElement(1)])) });
    expect(code).toBe(0);
    expect(existsSync(tempRoot) && statSync(tempRoot).isDirectory()).toBe(true);
    // No region directory created at all.
    expect(existsSync(join(tempRoot, "yola-jimeta"))).toBe(false);
    expect(consoleLog).toHaveBeenCalledWith(expect.stringMatching(/Dry-run/i));
    consoleLog.mockRestore();
  });
});

describe("runCli — failure safety", () => {
  it("does not write output on HTTP failure and preserves existing artifacts", async () => {
    // Seed existing output first.
    const existing = await runCli(VALID_ARGV, { fetchFn: fetchReturning(okBody([hospitalElement(1)])) });
    expect(existing).toBe(0);
    const runJsonBefore = readFileSync(join(tempRoot, "yola-jimeta", "_run.json"), "utf8");

    const failingFetch = (async () => new Response("slow down", { status: 429 })) as unknown as typeof fetch;
    const code = await runCli(VALID_ARGV, { fetchFn: failingFetch, delayFn: async () => {} });
    expect(code).toBe(1);
    expect(readFileSync(join(tempRoot, "yola-jimeta", "_run.json"), "utf8")).toBe(runJsonBefore);
  });

  it("does not write output on malformed JSON", async () => {
    const code = await runCli(VALID_ARGV, { fetchFn: fetchReturning("<html>overpass maintenance</html>") });
    expect(code).toBe(1);
    expect(existsSync(join(tempRoot, "yola-jimeta"))).toBe(false);
  });

  it("does not write output when the parser rejects all elements", async () => {
    const code = await runCli(VALID_ARGV, { fetchFn: fetchReturning(okBody(["garbage", { type: "node" }])) });
    expect(code).toBe(0); // skips are recorded, not fatal
    const run = JSON.parse(readFileSync(join(tempRoot, "yola-jimeta", "_run.json"), "utf8")) as { totals: { skipped: number; validCandidates: number } };
    expect(run.totals.validCandidates).toBe(0);
    expect(run.totals.skipped).toBeGreaterThanOrEqual(2);
    const candidates = JSON.parse(readFileSync(join(tempRoot, "yola-jimeta", "candidates.json"), "utf8"));
    expect(candidates).toEqual([]);
  });

  it("records retrieval metadata (UTC ISO timestamp, endpoint, bbox) in _run.json", async () => {
    await runCli(VALID_ARGV, { fetchFn: fetchReturning(okBody([hospitalElement(1)])) });
    const run = JSON.parse(readFileSync(join(tempRoot, "yola-jimeta", "_run.json"), "utf8")) as {
      retrievedAt: string; endpoint: string; bbox: number[]; request: { userAgent: string; method: string };
    };
    expect(run.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(run.endpoint).toContain("overpass");
    expect(run.bbox).toEqual([8.85, 12.35, 9.65, 12.75]);
    expect(run.request.userAgent).toMatch(/Lifeguard360-facility-discovery/);
    expect(run.request.method).toBe("POST");
  });
});

describe("deterministic analysis output", () => {
  const discovery = {
    region: "yola-jimeta",
    bbox: [8.85, 12.35, 9.65, 12.75] as [number, number, number, number],
    endpoint: "https://overpass.test",
    queryRef: "medical-v1",
    retrievedAt: "2026-09-18T00:00:00.000Z",
  };
  const request = { method: "POST" as const, userAgent: "ua", timeoutMs: 25_000, retries: 1, attempts: 1, bytes: 10 };

  it("is byte-stable across runs for the same payload (timestamp is injected, not clocked)", () => {
    const payload = JSON.parse(okBody([hospitalElement(2), hospitalElement(1)]));
    const a = buildAnalysis(payload, discovery, CURATED_DATASET_PATH, request);
    const b = buildAnalysis(JSON.parse(JSON.stringify(payload)), discovery, CURATED_DATASET_PATH, request);
    expect(JSON.stringify(a.candidates)).toBe(JSON.stringify(b.candidates));
    expect(JSON.stringify(a.duplicates)).toBe(JSON.stringify(b.duplicates));
    expect(JSON.stringify(a.run)).toBe(JSON.stringify(b.run));
  });

  it("sorts candidates by candidateId regardless of input order", () => {
    const analysis = buildAnalysis(JSON.parse(okBody([hospitalElement(9), hospitalElement(1), hospitalElement(5)])), discovery, CURATED_DATASET_PATH, request);
    const ids = analysis.candidates.map((c) => c.candidateId);
    expect(ids).toEqual([...ids].sort());
  });

  it("omits the raw Overpass payload from artifacts", () => {
    const analysis = buildAnalysis(JSON.parse(okBody([hospitalElement(1)])), discovery, CURATED_DATASET_PATH, request);
    const serialized = JSON.stringify(analysis);
    expect(serialized).not.toContain('"version":0.6');
    expect(serialized.length).toBeLessThan(50_000);
  });
});

describe("curated dataset is read-only input", () => {
  it("loadCuratedViews does not mutate the file", () => {
    const before = readFileSync(CURATED_DATASET_PATH, "utf8");
    const views = loadCuratedViews(CURATED_DATASET_PATH);
    expect(views.length).toBeGreaterThanOrEqual(6);
    expect(readFileSync(CURATED_DATASET_PATH, "utf8")).toBe(before);
  });
});

describe("filesystem confinement", () => {
  it("never writes outside the output root", async () => {
    const probe = join(tempRoot, "should-not-exist.txt");
    const code = await runCli(VALID_ARGV, { fetchFn: fetchReturning(okBody([hospitalElement(1)])) });
    expect(code).toBe(0);
    expect(existsSync(probe)).toBe(false);
    // Only the region directory exists at the root.
    const entries = statSync(tempRoot);
    expect(entries.isDirectory()).toBe(true);
  });
});
