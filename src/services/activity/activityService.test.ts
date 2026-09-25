import { beforeEach, describe, expect, it, vi } from "vitest";

import { listActivity, logActivity } from "@/services/activity/activityService";
import { listDemoActivity } from "@/services/activity/demoActivityStore";

/**
 * logActivity contract after the unauthenticated-access Task 2 change:
 *  - uid === null  → demoActivityStore (browser-local, never Firestore)
 *  - uid !== null  → the existing Firestore path, unchanged
 * getDb is mocked to THROW so any Firestore touch while signed out fails the
 * test loudly.
 *
 * The listActivity() read mapping is covered below too: a stored createdAt
 * must be returned as-is (never blanked), and a document whose type is not one
 * of the six real activity types must be skipped instead of relabelled.
 */

vi.mock("@/services/firebase/client", () => ({
  isFirebaseConfigured: vi.fn(() => true),
  // The signed-out tests assert getDb is never CALLED; the authenticated test
  // needs it to succeed and return a mock db.
  getDb: vi.fn(() => ({ __mockFirestoreDb: true })),
}));

const addDocMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const getDocsMock = vi.hoisted(() => vi.fn());

vi.mock("firebase/firestore", () => ({
  addDoc: addDocMock,
  collection: vi.fn((...segments: string[]) => segments),
  getDocs: getDocsMock,
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  describeFirebaseError: vi.fn(),
}));

vi.mock("@/services/firebase/db", () => ({
  describeFirebaseError: vi.fn(() => "firestore error"),
}));

describe("logActivity — signed-out vs authenticated dispatch", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("logActivity(null, …) writes to the device-local store and never touches Firestore", async () => {
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

  it("a signed-out location_shared record has coordinates stripped (data minimisation)", async () => {
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

describe("listActivity — Firestore read mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDocsMock.mockReset();
  });

  it("returns the stored createdAt instead of blanking it", async () => {
    getDocsMock.mockResolvedValue({
      docs: [
        {
          id: "act-1",
          data: () => ({
            type: "contact_added",
            detail: { relationship: "Parent" },
            createdAt: "2026-09-01T10:00:00.000Z",
          }),
        },
      ],
    });

    const records = await listActivity("user-1");

    expect(records).toEqual([
      {
        id: "act-1",
        type: "contact_added",
        detail: { relationship: "Parent" },
        createdAt: "2026-09-01T10:00:00.000Z",
      },
    ]);
  });

  it("falls back to an empty timestamp when the stored createdAt is not a string", async () => {
    getDocsMock.mockResolvedValue({
      docs: [
        {
          id: "act-2",
          data: () => ({
            type: "contact_deleted",
            detail: { contactId: "c1" },
            createdAt: { seconds: 1_700_000_000 },
          }),
        },
      ],
    });

    const records = await listActivity("user-1");

    expect(records).toHaveLength(1);
    expect(records[0].createdAt).toBe("");
  });

  it("skips a document with an unknown type instead of relabelling it as emergency_action", async () => {
    getDocsMock.mockResolvedValue({
      docs: [
        {
          id: "unknown-type",
          data: () => ({
            type: "profile_updated",
            detail: {},
            createdAt: "2026-09-01T10:00:00.000Z",
          }),
        },
        {
          id: "real-record",
          data: () => ({
            type: "emergency_action",
            detail: {
              action: "call_initiated",
              contactId: "c1",
              observedState: "composer-opened",
            },
            createdAt: "2026-09-01T11:00:00.000Z",
          }),
        },
      ],
    });

    const records = await listActivity("user-1");

    expect(records.map((record) => record.id)).toEqual(["real-record"]);
    expect(records.some((record) => record.id === "unknown-type")).toBe(false);
  });

  it("preserves the stored order and applies the limit", async () => {
    getDocsMock.mockResolvedValue({
      docs: ["2026-09-03", "2026-09-02", "2026-09-01"].map((day, index) => ({
        id: `act-${index}`,
        data: () => ({
          type: "offline_download",
          detail: { version: "1.0.0" },
          createdAt: `${day}T00:00:00.000Z`,
        }),
      })),
    });

    const records = await listActivity("user-1", 2);

    expect(records.map((record) => record.id)).toEqual(["act-0", "act-1"]);
  });
});
