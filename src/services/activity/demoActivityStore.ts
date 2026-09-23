import { ACTIVITY_TYPES, type ActivityRecord, type ActivityType } from "@/types";

/**
 * Demo-mode activity store (temporary, like the Admin Demo posture).
 *
 * While the app is in its supervised demo phase, signed-out visitors produce
 * activity history too (emergency actions, contact CRUD on the demo contacts,
 * offline downloads). These records are kept ONLY in this browser's
 * localStorage under a dedicated namespace — they are never written to
 * Firestore, and logging never initialises Firebase. The real authenticated
 * activity architecture (activityService over users/{uid}/activity, enforced
 * by Firestore rules) is untouched and remains the production path for
 * signed-in users.
 *
 * Follows the established demoContactStore pattern: one versioned
 * `lifeguard360.*.v1` key, defensive JSON parsing, private-browsing-safe.
 * Unlike the contacts store, logging is best-effort and never throws — the
 * same "activity must never block the user's primary action" contract the
 * authenticated logActivity() has always had.
 *
 * Data minimisation (guest location activity): exact coordinates are NEVER
 * persisted for guests. The stored detail keeps enough non-sensitive context
 * (e.g. via: "sms" | "get-help", contactId) for Activity history to remain
 * meaningful, while the precise location stays only in the live action.
 */

const DEMO_ACTIVITY_KEY = "lifeguard360.demoActivity.v1";
const MAX_DEMO_ACTIVITY_RECORDS = 100;

function isActivityTypeValue(value: unknown): value is ActivityType {
  return typeof value === "string" && (ACTIVITY_TYPES as readonly string[]).includes(value);
}

function isDemoActivityRecord(value: unknown): value is ActivityRecord {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.startsWith("demo-") &&
    isActivityTypeValue(candidate.type) &&
    typeof candidate.detail === "object" &&
    candidate.detail !== null &&
    !Array.isArray(candidate.detail) &&
    typeof candidate.createdAt === "string" &&
    !Number.isNaN(Date.parse(candidate.createdAt))
  );
}

/** Read the demo activity for this browser. Returns [] when absent/corrupt. */
export function listDemoActivity(): ActivityRecord[] {
  try {
    const raw = window.localStorage.getItem(DEMO_ACTIVITY_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop anything that does not match the ActivityRecord shape instead of
    // crashing — corrupt storage behaves like an empty demo history. Only the
    // six existing activity types are ever accepted.
    return parsed.filter(isDemoActivityRecord);
  } catch {
    return [];
  }
}

/**
 * Guest data minimisation: exact coordinates never persist in local storage.
 * Only the top-level `coordinates` key is removed (the shape the app writes);
 * everything else the caller passed is preserved verbatim.
 */
function stripCoordinates(detail: Record<string, unknown>): Record<string, unknown> {
  if (!("coordinates" in detail)) return detail;
  const minimal = { ...detail };
  delete minimal.coordinates;
  return minimal;
}

/** Append a demo activity record locally. Best-effort: never throws. */
export function logDemoActivity(type: ActivityType, detail: Record<string, unknown>): void {
  // Only the six existing activity types are accepted; anything else is
  // silently dropped (an unknown event must never enter the history).
  if (!isActivityTypeValue(type)) return;
  try {
    const record: ActivityRecord = {
      // Demo-local id, namespaced so it can never collide with a Firestore
      // document id.
      id: `demo-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`,
      type,
      detail: stripCoordinates(detail),
      createdAt: new Date().toISOString(),
    };
    // Newest-first, capped so the demo history cannot grow without bound.
    const records = [record, ...listDemoActivity()].slice(0, MAX_DEMO_ACTIVITY_RECORDS);
    window.localStorage.setItem(DEMO_ACTIVITY_KEY, JSON.stringify(records));
  } catch {
    // Unusable browser storage (private browsing, quota, disabled) must never
    // crash the app or block the user's primary action — the record is
    // simply not kept.
  }
}
