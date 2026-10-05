/**
 * Admin claim tool (Stage 3 — admin authorization foundation).
 *
 * The ONLY sanctioned mechanism for granting, revoking, or inspecting the
 * `admin` Firebase Auth custom claim that gates the administration area
 * (RequireAdmin + Firestore rules evaluate `admin === true` independently).
 *
 * Usage:
 *   npm run set:admin -- --uid <UID> --grant    # set admin: true
 *   npm run set:admin -- --uid <UID> --revoke   # remove the admin claim
 *   npm run set:admin -- --uid <UID> --check    # report state, no mutation
 *   optional: --allow-unverified                # grant despite an unverified
 *                                               # email (NOT recommended)
 *
 * Behaviour contract (mirrors tools/seedFacilities.ts):
 * - Arguments are strictly validated BEFORE any Firebase module is loaded, so
 *   invalid usage never touches credentials or the network.
 * - firebase-admin is loaded dynamically only for valid invocations.
 * - Credentials: Application Default Credentials ONLY (ADC) as the primary
 *   path. When ADC is unavailable, the tool falls back to the Firebase CLI's
 *   own OAuth token (~/.config/configstore/firebase-tools.json) — still a
 *   local, operator-held credential: never hard-coded, never written to the
 *   repository, never printed. CLI arguments are never accepted as secrets.
 * - --grant REFUSES to authorise an unverified email address unless
 *   --allow-unverified is passed explicitly (admin identities must be
 *   verified first — send the verification email from the app, then grant).
 * - Only the `admin` key is mutated; every other existing custom claim is
 *   preserved (grant keeps other claims; revoke removes only `admin`).
 * - No real production mutation happens without an explicit, deliberate run
 *   by an operator holding local credentials.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type Operation = "grant" | "revoke" | "check";

// (Node built-ins are imported statically above; the Firebase Admin SDK stays
// dynamically imported after argument validation — historical contract, unchanged.)

interface CliArgs {
  uid: string;
  operation: Operation;
  allowUnverified: boolean;
}

const USAGE = `Usage: npm run set:admin -- --uid <UID> --grant|--revoke|--check [--allow-unverified]

Options:
  --uid <UID>   Firebase Auth user ID to operate on (required)
  --grant       set the custom claim admin = true (other claims preserved)
  --revoke      remove only the admin custom claim (other claims preserved)
  --check       report the current admin claim state without modifying anything
  --allow-unverified
                grant the claim even when the account's email is not verified
                (by default --grant refuses an unverified address)`;

interface ParsedArgs {
  uid: string | null;
  operation: Operation | null;
  allowUnverified: boolean;
}

function parseArgs(argv: string[]): { args: CliArgs | null; error: string | null } {
  const parsed: ParsedArgs = { uid: null, operation: null, allowUnverified: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--uid") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        return { args: null, error: "--uid requires a Firebase Auth user ID value." };
      }
      if (parsed.uid !== null) {
        return { args: null, error: "--uid was provided more than once." };
      }
      parsed.uid = value;
      i += 1;
    } else if (arg === "--grant" || arg === "--revoke" || arg === "--check") {
      if (parsed.operation !== null) {
        return { args: null, error: "Provide exactly one of --grant, --revoke or --check." };
      }
      parsed.operation = arg.slice(2) as Operation;
    } else if (arg === "--allow-unverified") {
      parsed.allowUnverified = true;
    } else {
      return { args: null, error: `Unknown argument: ${arg}` };
    }
  }
  if (parsed.uid === null) {
    return { args: null, error: "--uid <UID> is required." };
  }
  if (parsed.operation === null) {
    return { args: null, error: "Provide exactly one of --grant, --revoke or --check." };
  }
  return {
    args: {
      uid: parsed.uid,
      operation: parsed.operation,
      allowUnverified: parsed.allowUnverified,
    },
    error: null,
  };
}

/** The credential-backed operations the tool needs, regardless of backend. */
interface UserRecord {
  customClaims: Record<string, unknown>;
  emailVerified: boolean;
}

interface ClaimBackend {
  /** Which local credential backs this run (printed once, never a secret). */
  label: string;
  getUser: (uid: string) => Promise<UserRecord | null>;
  setClaims: (uid: string, claims: Record<string, unknown>) => Promise<void>;
}

/** `{ admin: ... }` removed, every other claim key untouched. */
function claimsWithoutAdmin(existing: Record<string, unknown>): Record<string, unknown> {
  const { admin: _removed, ...rest } = existing;
  void _removed;
  return rest;
}

/** Human-readable admin state; malformed values are shown but never authorize. */
function describeAdminClaim(existing: Record<string, unknown>): string {
  if (!("admin" in existing)) return "admin claim: (not set)";
  const value = existing.admin;
  return value === true
    ? "admin: true (authorized)"
    : `admin claim: ${typeof value} ${String(value)} (NOT authorizing — only boolean true counts)`;
}

// ---------------------------------------------------------------------------
// Backend A (preferred): firebase-admin with Application Default Credentials
// ---------------------------------------------------------------------------

interface AdminAuthApi {
  getUser: (
    uid: string,
  ) => Promise<{ customClaims?: Record<string, unknown> | null; emailVerified?: boolean }>;
  setCustomUserClaims: (uid: string, claims: Record<string, unknown> | null) => Promise<void>;
}

async function tryAdcBackend(): Promise<{ backend: ClaimBackend; app: { delete: () => Promise<void> } } | { backend: null; reason: string }> {
  const specifier = "firebase-admin";
  const authSpecifier = "firebase-admin/auth";
  let adminRoot: unknown;
  let adminAuthModule: unknown;
  try {
    adminRoot = await import(/* @vite-ignore */ specifier);
    adminAuthModule = await import(/* @vite-ignore */ authSpecifier);
  } catch {
    return { backend: null, reason: "the `firebase-admin` package is not installed" };
  }

  const adminApi = adminRoot as { initializeApp: () => unknown };
  let app: { delete: () => Promise<void> };
  try {
    app = adminApi.initializeApp() as { delete: () => Promise<void> };
  } catch (error) {
    return {
      backend: null,
      reason: `ADC unavailable (${error instanceof Error ? error.message : String(error)})`,
    };
  }

  const authModule = adminAuthModule as { getAuth: (app?: unknown) => AdminAuthApi };
  const auth = authModule.getAuth(app);
  const backend: ClaimBackend = {
    label: "Application Default Credentials (firebase-admin)",
    getUser: async (uid) => {
      try {
        const record = await auth.getUser(uid);
        return {
          customClaims: record.customClaims ?? {},
          emailVerified: record.emailVerified === true,
        };
      } catch (error) {
        const code = (error as { code?: string } | null)?.code ?? "";
        if (code === "auth/user-not-found") return null;
        throw error;
      }
    },
    setClaims: async (uid, claims) => {
      await auth.setCustomUserClaims(uid, claims);
    },
  };
  return { backend, app };
}

// ---------------------------------------------------------------------------
// Backend B (fallback): Identity Toolkit REST with the Firebase CLI's OAuth
// token. Used when ADC is absent (e.g. developer laptops where only
// `firebase login` has ever run). Same API surface, same merge semantics,
// same refusal to print anything secret. The CLI refreshes its own token on
// any invocation, so an expired token is recovered by running the CLI once.
// ---------------------------------------------------------------------------

interface CliTokenConfig {
  tokens?: {
    access_token?: string;
    expires_at?: number;
    refresh_token?: string;
  };
}

function readCliTokenConfig(): CliTokenConfig | null {
  try {
    const file = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
    return JSON.parse(fs.readFileSync(file, "utf8")) as CliTokenConfig;
  } catch {
    return null;
  }
}

function readDefaultProject(): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(".firebaserc", "utf8")) as {
      projects?: { default?: string };
    };
    return parsed.projects?.default ?? null;
  } catch {
    return null;
  }
}

function spawnCliRefresh(): boolean {
  const result = spawnSync("npx", ["firebase", "projects:list", "--json", "--non-interactive"], {
    stdio: "ignore",
    shell: process.platform === "win32",
    timeout: 120_000,
  });
  return result.status === 0;
}

async function getFreshCliAccessToken(): Promise<string | null> {
  const cfg = readCliTokenConfig();
  if (cfg?.tokens?.access_token === undefined) return null;
  const expiresAt = cfg.tokens.expires_at ?? 0;
  const stillValid = expiresAt - Date.now() > 60_000;
  if (stillValid) return cfg.tokens.access_token;
  if (cfg.tokens.refresh_token === undefined) return null;
  // Expired: any authenticated CLI command refreshes and persists the token.
  spawnCliRefresh();
  const refreshed = readCliTokenConfig();
  const token = refreshed?.tokens?.access_token;
  if (token === undefined) return null;
  const refreshedExpiry = refreshed?.tokens?.expires_at ?? 0;
  return refreshedExpiry - Date.now() > 0 ? token : null;
}

async function identityToolkitRequest(
  projectId: string,
  method: "lookup" | "update",
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const token = await getFreshCliAccessToken();
  if (token === null) {
    throw new Error("the Firebase CLI OAuth token is unavailable or expired");
  }
  const url = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Identity Toolkit ${method} failed (HTTP ${response.status})`);
  }
  return text === "" ? {} : (JSON.parse(text) as Record<string, unknown>);
}

async function tryCliBackend(): Promise<{ backend: ClaimBackend } | { backend: null; reason: string }> {
  const projectId = readDefaultProject();
  if (projectId === null) {
    return { backend: null, reason: "no default project in .firebaserc" };
  }
  if ((await getFreshCliAccessToken()) === null) {
    return { backend: null, reason: "no usable Firebase CLI OAuth token (run `firebase login`)" };
  }

  const backend: ClaimBackend = {
    label: "Firebase CLI OAuth token (no ADC on this machine)",
    getUser: async (uid) => {
      const response = await identityToolkitRequest(projectId, "lookup", { localId: [uid] });
      const users = response.users as Array<Record<string, unknown>> | undefined;
      const user = users?.[0];
      if (user === undefined) return null;
      let claims: Record<string, unknown> = {};
      const raw = user.customAttributes;
      if (typeof raw === "string" && raw !== "") {
        try {
          claims = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          claims = {};
        }
      }
      return { customClaims: claims, emailVerified: user.emailVerified === true };
    },
    setClaims: async (uid, claims) => {
      await identityToolkitRequest(projectId, "update", {
        localId: uid,
        customAttributes: JSON.stringify(claims),
      });
      // Read-back verification: never report success without server truth.
      const verify = await backend.getUser(uid);
      if (verify === null) {
        throw new Error("user vanished after the update — cannot verify the claim");
      }
      const same =
        Object.keys(claims).length === Object.keys(verify.customClaims).length &&
        Object.entries(claims).every(([key, value]) => verify.customClaims[key] === value);
      if (!same) {
        throw new Error("server did not persist the updated claims — refusing to claim success");
      }
    },
  };
  return { backend };
}

// ---------------------------------------------------------------------------

async function run(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed.args === null) {
    console.error(`\n${USAGE}\n\nArgument error: ${parsed.error}`);
    return 1;
  }
  const { uid, operation, allowUnverified } = parsed.args;

  // Credential resolution: ADC first (unchanged historical contract), CLI
  // OAuth token as the explicit fallback for machines without ADC. ADC can
  // fail lazily (init succeeds, first call discovers there is no credential
  // or project), so the switch happens on the first getUser attempt. Both
  // paths are operator-held, local credentials; neither is ever printed.
  const candidates: ClaimBackend[] = [];
  let adcApp: { delete: () => Promise<void> } | null = null;
  const adc = await tryAdcBackend();
  const adcReason = "reason" in adc ? adc.reason : "available";
  if (adc.backend !== null) {
    candidates.push(adc.backend);
    adcApp = adc.app;
  }
  const cli = await tryCliBackend();
  const cliReason = "reason" in cli ? cli.reason : "available";
  if (cli.backend !== null) {
    candidates.push(cli.backend);
  }

  if (candidates.length === 0) {
    console.error(
      "\nABORTED: no local credential available.\n" +
        `  ADC path: ${adcReason}\n` +
        `  CLI fallback: ${cliReason}\n` +
        "  Provide GOOGLE_APPLICATION_CREDENTIALS (a service account with Firebase " +
        "Authentication admin permissions) or run `gcloud auth application-default login`;\n" +
        "  or install the Firebase CLI and run `npx firebase login` with an account that " +
        "owns the project.",
    );
    return 2;
  }

  let record: UserRecord | null = null;
  let backend: ClaimBackend | null = null;
  const failures: string[] = [];
  for (const candidate of candidates) {
    try {
      record = await candidate.getUser(uid);
      backend = candidate;
      break;
    } catch (error) {
      failures.push(`${candidate.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (backend === null) {
    if (adcApp !== null) await adcApp.delete();
    console.error(
      `\nABORTED: could not load user "${uid}" through any local credential.\n` +
        failures.map((line) => `  - ${line}\n`).join("") +
        "  (If ADC is configured but lacks Firebase Admin permissions, grant the service " +
        "account Firebase Authentication Admin, or rely on the CLI token path.)",
    );
    return 1;
  }

  if (record === null) {
    if (adcApp !== null) await adcApp.delete();
    console.error(`\nABORTED: no Firebase Auth user exists with uid "${uid}".`);
    return 1;
  }

  const existing = record.customClaims;

  if (operation === "check") {
    const otherKeys = Object.keys(existing).filter((key) => key !== "admin");
    console.log(`\nUser ${uid}`);
    console.log(`  ${describeAdminClaim(existing)}`);
    console.log(`  email verified: ${record.emailVerified}`);
    console.log(
      `  other custom claim keys: ${
        otherKeys.length > 0 ? otherKeys.join(", ") : "(none)"
      } (values are never printed)`,
    );
    console.log(`  credential: ${backend.label}`);
    if (adcApp !== null) await adcApp.delete();
    return 0;
  }

  // Identity quality gate: an admin claim on an unverified mailbox is an
  // avoidable risk (anyone able to re-verify that mailbox later inherits the
  // role). Refuse unless the operator explicitly overrides.
  if (operation === "grant" && !record.emailVerified && !allowUnverified) {
    if (adcApp !== null) await adcApp.delete();
    console.error(
      `\nABORTED: the email address for user "${uid}" is NOT verified.\n` +
        "  Have the user complete Firebase's verification email first (the app shows\n" +
        "  a \"Verify your email\" notice with a resend action), then re-run this command.\n" +
        "  To override deliberately: npm run set:admin -- --uid <UID> --grant --allow-unverified",
    );
    return 1;
  }

  // Idempotence: no mutation when the requested state already holds.
  if (operation === "grant" && existing.admin === true) {
    console.log(`\nNo change: user ${uid} already has admin: true.`);
    if (adcApp !== null) await adcApp.delete();
    return 0;
  }
  if (operation === "revoke" && !("admin" in existing)) {
    console.log(`\nNo change: user ${uid} has no admin claim.`);
    if (adcApp !== null) await adcApp.delete();
    return 0;
  }

  // Only the `admin` key changes; every other custom claim is preserved.
  const nextClaims: Record<string, unknown> =
    operation === "grant" ? { ...existing, admin: true } : claimsWithoutAdmin(existing);

  try {
    await backend.setClaims(uid, nextClaims);
  } catch (error) {
    if (adcApp !== null) await adcApp.delete();
    console.error(
      `\nABORTED: could not set custom claims for "${uid}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return 1;
  }

  console.log(
    `\nOK: ${operation === "grant" ? "granted" : "revoked"} the admin claim for user ${uid}.`,
  );
  console.log(`  credential: ${backend.label}`);
  console.log(
    `  custom claim keys now: ${
      Object.keys(nextClaims).length > 0 ? Object.keys(nextClaims).join(", ") : "(none)"
    }`,
  );
  console.log(
    "  Note: the user's ID token carries the change after their next token refresh (or sign-in).\n" +
      "  In the app, the \"Verify your email / check now\" refresh or a fresh sign-in picks it up immediately.",
  );
  if (adcApp !== null) await adcApp.delete();
  return 0;
}

const exitCode = await run(process.argv.slice(2));
process.exitCode = exitCode;
