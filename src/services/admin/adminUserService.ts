import { collection, getDocs } from "firebase/firestore";

import { getDb } from "@/services/firebase/client";
import { describeFirebaseError, timestampToIso } from "@/services/firebase/db";

/**
 * Admin user listing (read-only).
 *
 * Firestore rules already allow a claim-holding admin to READ and LIST
 * users/{uid} profiles — writes stay strictly owner-controlled by design,
 * and this service intentionally offers no write path at all.
 *
 * Data minimisation: only displayName and audit timestamps are surfaced.
 * Phone numbers, contacts and activity subcollections are personal data the
 * admin rules deliberately do not expose, and they are never read here.
 */

export interface AdminUserProfileSummary {
  uid: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * List all user profiles. Requires the caller to hold the admin custom claim;
 * Firestore rules reject everyone else, and the rejection is surfaced as an
 * honest, user-actionable error (never swallowed into fake data).
 */
export async function listUserProfiles(): Promise<AdminUserProfileSummary[]> {
  try {
    const db = getDb();
    const snapshot = await getDocs(collection(db, "users"));
    return snapshot.docs
      .map((docSnapshot) => {
        const data = docSnapshot.data() as Record<string, unknown>;
        return {
          uid: docSnapshot.id,
          displayName: typeof data.displayName === "string" ? data.displayName : "User",
          createdAt: timestampToIso(data.createdAt),
          updatedAt: timestampToIso(data.updatedAt),
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}
