import { beforeEach, describe, expect, it, vi } from "vitest";

import { logActivity } from "@/services/activity/activityService";
import { listDemoActivity } from "@/services/activity/demoActivityStore";

/**
 * logActivity contract after the Guest Mode Task 2 change:
 *  - uid === null  → demoActivityStore (browser-local, never Firestore)
 *  - uid !== null  → the existing Firestore path, unchanged
 * getDb is mocked to THROW so any guest Firestore touch fails the test loudly.
 */

vi.mock("@/services/firebase/client", () => ({
  isFirebaseConfigured: vi.fn(() => true),
  // The guest tests assert getDb is never CALLED; the authenticated test
  // needs it to succeed and return a mock db.
  getDb: vi.fn(() => ({ __mockFirestoreDb: true })),
}));

const addDocMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("firebase/firestore", () => ({
  addDoc: addDocMock,
  collection: vi.fn((...segments: string[]) => segments),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  describeFirebaseError: vi.fn(),
}));

vi.mock("@/services/firebase/db", () => ({
  describeFirebaseError: vi.fn(() => "firestore error"),
}));

describe("logActivity — guest vs authenticated dispatch", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("a guest logActivity(null, …) writes to the demo store and never touches Firestore", async () => {
    const { getDb } = await import("@/services/firebase/client");

    await logActivity(null, "emergency_action", {
      action: "call_initiated",
      contactId: "demo-1",
      observedState: "composer-opened",
    });

    const records = listDemoActivity();
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe("emergency_action");
    expect(getDb).not.toHaveBeenCalled();
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it("a guest location_shared record has coordinates stripped (data minimisation)", async () => {
    await logActivity(null, "location_shared", {
      via: "get-help",
      coordinates: { latitude: 9.2, longitude: 12.5 },
    });

    const record = listDemoActivity()[0];
    expect(record.detail.coordinates).toBeUndefined();
    expect(record.detail.via).toBe("get-help");
  });

  it("an authenticated logActivity(uid, …) keeps using the Firestore path", async () => {
    await logActivity("user-1", "contact_added", { relationship: "Parent" });

    expect(addDocMock).toHaveBeenCalledTimes(1);
    const [segments, payload] = addDocMock.mock.calls[0] as unknown as [
      unknown[],
      Record<string, unknown>,
    ];
    // collection(db, "users", uid, "activity") — the path segments pin that
    // the authenticated write targets users/{uid}/activity exactly as before.
    expect(segments.slice(1)).toEqual(["users", "user-1", "activity"]);
    expect(payload.type).toBe("contact_added");
    expect(payload.detail).toEqual({ relationship: "Parent" });
    expect(payload.createdAt).toBe("SERVER_TIMESTAMP");
    expect(listDemoActivity()).toEqual([]); // demo store untouched
  });
});
