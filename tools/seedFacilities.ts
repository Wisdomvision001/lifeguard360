/**
 * Facility dataset seeder (Phase 5D-2/5D-3) — the ONLY sanctioned write path
 * into the Firestore `facilities` collection (docs/DATASET-CONTRACT.md).
 *
 * Usage:
 *   npm run seed:facilities -- --file tools/facilities.json --dry-run   (default)
 *   npm run seed:facilities -- --file tools/facilities.json --write
 *
 * Behaviour contract:
 * - Validates 100% of the dataset BEFORE any write; one bad record aborts everything.
 * - Dry-run is the default: no Firebase modules are even loaded.
 * - Writes are idempotent `set()` calls with deterministic document IDs.
 * - This script never invents, repairs, or upgrades data. Garbage in → refused.
 *
 * Credentials: firebase-admin is loaded dynamically ONLY in --write mode and
 * picks up standard ADC (GOOGLE_APPLICATION_CREDENTIALS / gcloud auth).
 * Nothing is hard-coded; if the dependency or credentials are missing the
 * script reports exactly what is absent and exits non-zero without writing.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  validateDataset,
  type DatasetInput,
  type ValidationResult,
} from "./facilityValidation.ts";

interface CliArgs {
  file: string | null;
  write: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { file: null, write: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file") {
      args.file = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--write") {
      args.write = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }
  return args;
}

function printSummary(result: ValidationResult, fileLabel: string): void {
  console.log(`\nDataset: ${fileLabel}`);
  console.log(`Records: ${result.records.length}`);
  for (const record of result.records) {
    console.log(
      `  [${record.index}] ${record.id}  ${record.name || "(unnamed)"}  verified=${record.verified}`,
    );
  }
  for (const warning of result.warnings) {
    console.log(`  warning: ${warning}`);
  }
  if (result.errors.length > 0) {
    console.log(`\nValidation FAILED — ${result.errors.length} error(s):`);
    for (const error of result.errors) {
      const where = error.index >= 0 ? `record ${error.index}` : "dataset";
      console.log(`  ✗ ${where} · ${error.field}: ${error.message}`);
    }
  } else {
    console.log("\nValidation PASSED — dataset satisfies docs/DATASET-CONTRACT.md.");
  }
}

async function writeDataset(dataset: DatasetInput, result: ValidationResult): Promise<number> {
  // Dynamic load with a variable specifier: TypeScript cannot statically
  // resolve `firebase-admin` (deliberately not a dependency), so we type the
  // module as unknown and validate its shape at runtime instead.
  // firebase-admin v12+ exposes Firestore via the `firebase-admin/firestore`
  // subpath (getFirestore), not the root namespace.
  const specifier = "firebase-admin";
  const fsSpecifier = "firebase-admin/firestore";
  let admin: unknown;
  let adminFs: unknown;
  try {
    admin = await import(/* @vite-ignore */ specifier);
    adminFs = await import(/* @vite-ignore */ fsSpecifier);
  } catch {
    console.error(
      "\nWRITE ABORTED: the `firebase-admin` package is not installed.\n" +
        "This is deliberate — the project does not ship server credentials.\n" +
        "To enable real imports: `npm install --save-dev firebase-admin`, provide\n" +
        "Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS pointing at a\n" +
        "service-account JSON with datastore.user, or `gcloud auth application-default login`),\n" +
        "then re-run with --write. See docs/DATASET-CONTRACT.md §8.",
    );
    return 2;
  }

  const adminApi = admin as {
    initializeApp: () => unknown;
    firestore: () => {
      batch: () => {
        set: (ref: unknown, data: unknown) => void;
        commit: () => Promise<void>;
      };
      collection: (path: string) => { doc: (id: string) => unknown };
    };
    apps: unknown[];
  };

  let app: { delete: () => Promise<void> } | undefined;
  try {
    // ADC only — never hard-coded credentials.
    app = adminApi.initializeApp() as { delete: () => Promise<void> };
  } catch (error) {
    console.error(
      "\nWRITE ABORTED: could not initialise firebase-admin with Application Default Credentials.\n" +
        `Underlying error: ${error instanceof Error ? error.message : String(error)}\n` +
        "Provide GOOGLE_APPLICATION_CREDENTIALS or run `gcloud auth application-default login`.",
    );
    return 2;
  }

  const firestore = (adminFs as {
    getFirestore: (app?: unknown) => {
      batch: () => {
        set: (ref: unknown, data: unknown) => void;
        commit: () => Promise<void>;
      };
      collection: (path: string) => { doc: (id: string) => unknown };
    };
  }).getFirestore(app);
  const batch = firestore.batch();
  const collection = firestore.collection("facilities");
  let written = 0;

  try {
    for (const record of result.records) {
      const input = dataset.facilities[record.index];
      if (record.id === "(invalid)") continue; // unreachable when valid; belt & braces
      batch.set(collection.doc(record.id), {
        name: input.name,
        category: input.category,
        coordinates: {
          latitude: input.coordinates.latitude,
          longitude: input.coordinates.longitude,
        },
        verified: input.verified,
        source: input.source,
        updatedAt: input.updatedAt,
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.openingHours !== undefined ? { openingHours: input.openingHours } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
      });
      written += 1;
    }
    await batch.commit();
  } catch (error) {
    console.error(
      `\nWRITE FAILED after ${written} planned write(s): ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  } finally {
    if (app !== undefined) await app.delete().catch(() => undefined);
  }

  console.log(`\nWrote ${written} facility document(s) to Firestore (idempotent set()).`);
  return 0;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.file === null) {
    console.error("Usage: npm run seed:facilities -- --file <path-to-json> [--dry-run|--write]");
    return 2;
  }
  if (args.write && args.dryRun) {
    console.error("Conflicting flags: choose --write or --dry-run, not both.");
    return 2;
  }

  const fileLabel = resolve(args.file);
  let raw: string;
  try {
    raw = readFileSync(fileLabel, "utf8");
  } catch (error) {
    console.error(`Cannot read dataset file: ${fileLabel}\n${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    console.error(`Dataset file is not valid JSON: ${fileLabel}\n${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  const result = validateDataset(parsed);
  printSummary(result, fileLabel);

  if (!result.valid) {
    console.error("\nNothing was written. Fix every error above and re-run.");
    return 1;
  }

  if (!args.write) {
    console.log(
      args.dryRun
        ? "\nDry-run complete — nothing was written. Re-run with --write to import."
        : "\nDry-run (default) complete — nothing was written. Add --write to import.",
    );
    return 0;
  }

  if (args.dryRun === false) {
    console.log("\n--write supplied: importing validated dataset…");
  }
  return writeDataset(parsed as DatasetInput, result);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(`Unexpected failure: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
