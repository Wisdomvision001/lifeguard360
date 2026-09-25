import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listDemoActivity,
  logDemoActivity,
} from "@/services/activity/demoActivityStore";
import type { ActivityType } from "@/types";

/**
 * Device-local activity store: localStorage only, never Firestore. These tests
 * pin the localStorage contract, the `demo-` id namespacing, the six-type
 * allowlist, the newest-first/100-cap behaviour, and the coordinate-minimisation
 * data-minimisation.
 */

const ALL_TYPES: readonly ActivityType[] = [
  "contact_added",
  "contact_updated",
  "contact_deleted",
  "location_shared",
  "emergency_action",
  "offline_download",
];

describe("demoActivityStore (device-local activity)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("starts empty with no Firestore involvement", () => {
    expect(listDemoActivity()).toEqual([]);
  });

  it("persists a valid record with a demo-namespaced id and ISO createdAt", () => {
    logDemoActivity("contact_added", { relationship: "Parent" });

    const records = listDemoActivity();
    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.id.startsWith("demo-")).toBe(true);
    expect(record.type).toBe("contact_added");
    expect(record.detail).toEqual({ relationship: "Parent" });
    expect(Number.isNaN(Date.parse(record.createdAt))).toBe(false);
    expect(record.createdAt).toBe(new Date(record.createdAt).toISOString());
  });

  it("accepts exactly the six existing activity types", () => {
    for (const type of ALL_TYPES) {
      logDemoActivity(type, {});
    }
    const records = listDemoActivity();
    expect(records).toHaveLength(ALL_TYPES.length);
    expect(new Set(records.map((record) => record.type))).toEqual(new Set(ALL_TYPES));
  });

  it("rejects unknown activity types", () => {
    logDemoActivity(
      "page_visit" as ActivityType,
      { url: "/somewhere" },
    );
    expect(listDemoActivity()).toEqual([]);
  });

  it("orders newest-first", () => {
    logDemoActivity("contact_added", { relationship: "Parent" });
    logDemoActivity("emergency_action", { action: "call_initiated" });

    const records = listDemoActivity();
    expect(records).toHaveLength(2);
    expect(records[0].type).toBe("emergency_action");
    expect(records[1].type).toBe("contact_added");
  });

  it("caps stored records at 100, keeping the newest", () => {
    for (let index = 0; index < 120; index += 1) {
      logDemoActivity("contact_added", { relationship: "Parent", seq: index });
    }
    const records = listDemoActivity();
    expect(records).toHaveLength(100);
    // Newest first: the last-written record (seq 119) is at the head.
    expect(records[0].detail.seq).toBe(119);
    // The oldest records (seq 0..19) were evicted.
    expect(records[records.length - 1].detail.seq).toBe(20);
  });

  it("strips exact coordinates from unauthenticated location_shared detail (data minimisation)", () => {
    logDemoActivity("location_shared", {
      via: "get-help",
      coordinates: { latitude: 9.1945102, longitude: 12.4914788 },
    });

    const record = listDemoActivity()[0];
    expect(record.type).toBe("location_shared");
    expect(record.detail.coordinates).toBeUndefined();
    expect(record.detail.via).toBe("get-help");
  });

  it("strips coordinates for every unauthenticated location_shared variant but keeps other detail", () => {
    logDemoActivity("location_shared", {
      via: "sms",
      contactId: "demo-abc123",
      coordinates: { latitude: 10.5, longitude: 13.2 },
    });

    const record = listDemoActivity()[0];
    expect(record.detail).toEqual({ via: "sms", contactId: "demo-abc123" });
  });

  it("tolerates corrupt stored data by behaving like an empty list", () => {
    window.localStorage.setItem("lifeguard360.demoActivity.v1", "{not json");
    expect(listDemoActivity()).toEqual([]);
  });

  it("filters invalid records instead of crashing", () => {
    window.localStorage.setItem(
      "lifeguard360.demoActivity.v1",
      JSON.stringify([
        { nonsense: true },
        { id: "not-demo-prefixed", type: "contact_added", detail: {}, createdAt: "2026-09-20T00:00:00.000Z" },
        { id: "demo-ok", type: "not_a_type", detail: {}, createdAt: "2026-09-20T00:00:00.000Z" },
        { id: "demo-ok2", type: "contact_added", detail: [], createdAt: "2026-09-20T00:00:00.000Z" },
        { id: "demo-ok3", type: "contact_added", detail: {}, createdAt: "not-a-date" },
        {
          id: "demo-valid",
          type: "offline_download",
          detail: { version: "v1" },
          createdAt: "2026-09-20T00:00:00.000Z",
        },
      ]),
    );
    const records = listDemoActivity();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("demo-valid");
  });

  it("does not crash when localStorage is unusable", () => {
    const setItemError = new Error("storage blocked");
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw setItemError;
    });

    expect(() => logDemoActivity("contact_added", { relationship: "Parent" })).not.toThrow();
    expect(() => listDemoActivity()).not.toThrow();
  });
});
