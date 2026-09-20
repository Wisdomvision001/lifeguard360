import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Safety assertions (Slice 1) — the discovery core is OFFLINE, preparation-only.
 * These tests pin the boundary so future edits cannot silently introduce
 * Firebase coupling or network behavior.
 */

const CORE_DIR = __dirname;

/** Recursively collects the discovery core's source files (excluding tests + fixtures). */
function coreSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "fixtures") continue;
      files.push(...coreSourceFiles(full));
      continue;
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const SOURCE_FILES = coreSourceFiles(CORE_DIR);

const CLI_FILE = SOURCE_FILES.find((f) => f.endsWith("cli.ts")) ?? "";
const OVERPASS_FILE = SOURCE_FILES.find((f) => f.endsWith("overpass.ts")) ?? "";
const CORE_ONLY_FILES = SOURCE_FILES.filter((f) => f !== CLI_FILE && f !== OVERPASS_FILE);

describe("discovery core safety boundary", () => {
  it("contains at least the expected core modules", () => {
    const names = SOURCE_FILES.map((f) => f.split(/[\\/]/).pop()).sort();
    expect(names).toEqual(
      expect.arrayContaining(["query.ts", "parse.ts", "address.ts", "categories.ts", "dedupe.ts", "compare.ts"]),
    );
  });

  it("imports no Firebase packages (admin or client)", () => {
    for (const file of SOURCE_FILES) {
      const text = readFileSync(file, "utf8");
      expect(text, `${file} must not import firebase`).not.toMatch(/from\s+["']firebase/i);
      expect(text, `${file} must not import firebase-admin`).not.toMatch(/["']firebase-admin/i);
      expect(text, `${file} must not dynamically import firebase`).not.toMatch(/import\(\s*["']firebase/i);
    }
  });

  it("imports nothing from src/services or the seeder", () => {
    for (const file of SOURCE_FILES) {
      const text = readFileSync(file, "utf8");
      expect(text, `${file} must not import src/services`).not.toMatch(/from\s+["'].*src\/services/);
      // Import statements only — the word may legitimately appear in comments.
      expect(text, `${file} must not import seedFacilities`).not.toMatch(/(?:from|require\()\s*["'].*seedFacilities["']/);
      expect(text, `${file} must not import facilityService`).not.toMatch(/(?:from|require\()\s*["'].*facilityService["']/);
    }
  });

  it("contains no network calls except the dedicated Overpass layer (CLI fetch only)", () => {
    for (const file of CORE_ONLY_FILES) {
      const text = readFileSync(file, "utf8");
      expect(text, `${file} must not call fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(text, `${file} must not use XMLHttpRequest`).not.toMatch(/XMLHttpRequest/);
      expect(text, `${file} must not import http/https/axios/node-fetch`).not.toMatch(
        /require\(\s*["'](https?|axios|node-fetch)["']\s*\)|from\s+["'](https?|axios|node-fetch)["']/,
      );
    }
    // The Overpass layer is the ONLY network module; it must use fetch with an explicit User-Agent.
    const text = readFileSync(OVERPASS_FILE, "utf8");
    expect(text).toMatch(/globalThis\.fetch|fetchFn \?\?/);
    expect(text).toContain("User-Agent");
  });

  it("CLI imports no Firebase and no application services", () => {
    const text = readFileSync(CLI_FILE, "utf8");
    expect(text).not.toMatch(/["']firebase-admin["']/);
    expect(text).not.toMatch(/from\s+["']firebase/i);
    expect(text).not.toMatch(/from\s+["'].*src\/services/);
    expect(text).not.toMatch(/(?:from|require\()\s*["'].*seedFacilities["']/);
    expect(text).not.toMatch(/(?:from|require\()\s*["'].*facilityService["']/);
  });

  it("CLI writes are confined to the discovery output root", () => {
    const text = readFileSync(CLI_FILE, "utf8");
    expect(text).toMatch(/DISCOVERY_ROOT = "tools\/discovery"/);
    // Output path is always outputRoot + resolved safe region name.
    expect(text).toMatch(/resolve\(outputRoot, region\.name\)/);
    expect(text).toMatch(/isSafeRegionName/);
    // No writes to the curated dataset or application tree.
    expect(text).not.toMatch(/facilities\.yola\.json["']\s*,\s*["']w/);
  });

  it("writes nothing — no fs usage in core modules (CLI owns all I/O)", () => {
    for (const file of CORE_ONLY_FILES) {
      const text = readFileSync(file, "utf8");
      expect(text, `${file} must not import node:fs`).not.toMatch(/from\s+["']node:fs["']/);
      expect(text, `${file} must not call writeFileSync`).not.toMatch(/writeFileSync|appendFileSync|mkdirSync/);
    }
    // The CLI is the single fs writer (overpass.ts must not touch the fs either).
    const overpassText = readFileSync(OVERPASS_FILE, "utf8");
    expect(overpassText).not.toMatch(/node:fs|writeFileSync|mkdirSync/);
    const cliText = readFileSync(CLI_FILE, "utf8");
    expect(cliText).toMatch(/writeFileSync/);
  });
});
