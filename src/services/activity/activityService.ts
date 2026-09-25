import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";

import type { ActivityRecord, ActivityType } from "@/types";
import { getDb } from "@/services/firebase/client";
import { describeFirebaseError } from "@/services/firebase/db";
import { logDemoActivity } from "@/services/activity/demoActivityStore";

/**
 * ActivityService (Phase 10): meaningful events only, data minimisation by
 * design — no page visits, no incidental UI interactions.
 */

const ACTIVITY_TYPES: readonly string[] = [
  "contact_added",
  "contact_updated",
  "contact_deleted",
  "location_shared",
  "emergency_action",
  "offline_download",
];

export function isActivityType(value: string): value is ActivityType {
  return (ACTIVITY_TYPES as readonly string[]).includes(value);
}

/** Store a minimal, purpose-bound activity record. Best-effort: never throws. */
export async function logActivity(
  uid: string | null,
  type: ActivityType,
  detail: Record<string, unknown>,
): Promise<void> {
  // Temporary authentication bypass: device-local storage only — no getDb(),
  // no Firestore APIs, no Firebase initialisation. The Firestore
  // implementation below is the unchanged authenticated path.
  if (uid === null) {
    logDemoActivity(type, detail);
    return;
  }
  try {
    const db = getDb();
    await addDoc(collection(db, "users", uid, "activity"), {
      type,
      detail,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Activity logging must never block the user's primary action.
  }
}

export async function listActivity(uid: string, limitTo = 100): Promise<ActivityRecord[]> {
  try {
    const db = getDb();
    const ref = collection(db, "users", uid, "activity");
    const snapshot = await getDocs(query(ref, orderBy("createdAt", "desc")));
    return snapshot.docs
      .flatMap((docSnapshot) => {
        const data = docSnapshot.data() as Record<string, unknown>;
        const rawType = typeof data.type === "string" ? data.type : "";
        // A record whose type is not one of the six real activity types is
        // skipped entirely. It used to be relabelled as "emergency_action",
        // which misrepresented what had actually happened.
        if (!isActivityType(rawType)) return [];
        return [
          {
            id: docSnapshot.id,
            type: rawType,
            detail: (data.detail as Record<string, unknown>) ?? {},
            // The stored server timestamp is read back as the string the SDK
            // serialises; anything else becomes "" rather than inventing a time.
            createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
          },
        ];
      })
      .slice(0, limitTo);
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}
