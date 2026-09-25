import { beforeEach, describe, expect, it } from "vitest";

import {
  addDemoContact,
  deleteDemoContact,
  listDemoContacts,
  updateDemoContact,
} from "@/services/contacts/demoContactStore";
import type { ContactRelationship } from "@/types";

/**
 * Device-local contacts store: localStorage only, never Firestore. These tests
 * pin the localStorage contract and the `demo-` id namespacing that keeps local
 * records forever distinguishable from real users/{uid}/contacts documents.
 */

const PAYLOAD = {
  fullName: "Demo Person",
  relationship: "Parent" as ContactRelationship,
  phoneNumber: "+2348012345678",
};

describe("demoContactStore (device-local contacts)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts empty with no Firestore involvement", () => {
    expect(listDemoContacts()).toEqual([]);
  });

  it("adds a contact with a demo-namespaced id and timestamps", () => {
    const contact = addDemoContact(PAYLOAD);
    expect(contact.id.startsWith("demo-")).toBe(true);
    expect(contact.fullName).toBe("Demo Person");
    expect(contact.createdAt).toBe(contact.updatedAt);
    expect(listDemoContacts()).toHaveLength(1);
  });

  it("persists across reads through localStorage only", () => {
    addDemoContact(PAYLOAD);
    const raw = window.localStorage.getItem("lifeguard360.demoContacts.v1");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toHaveLength(1);
    expect(listDemoContacts()).toHaveLength(1);
  });

  it("updates only local (demo-) ids and refreshes updatedAt", () => {
    const contact = addDemoContact(PAYLOAD);
    const updated = updateDemoContact(contact.id, { ...PAYLOAD, fullName: "Renamed" });
    expect(updated?.fullName).toBe("Renamed");
    expect(updated !== null && updated.updatedAt >= contact.updatedAt).toBe(true);
    // A non-demo id (as a Firestore document would have) is refused outright.
    expect(updateDemoContact("abc123", { ...PAYLOAD, fullName: "X" })).toBeNull();
  });

  it("deletes only local (demo-) ids and reports honestly", () => {
    const contact = addDemoContact(PAYLOAD);
    expect(deleteDemoContact("firestore-id")).toBe(false);
    expect(deleteDemoContact(contact.id)).toBe(true);
    expect(listDemoContacts()).toHaveLength(0);
  });

  it("tolerates corrupt stored data by behaving like an empty list", () => {
    window.localStorage.setItem("lifeguard360.demoContacts.v1", "{not json");
    expect(listDemoContacts()).toEqual([]);
    // A malformed entry is filtered, not crashed on.
    window.localStorage.setItem(
      "lifeguard360.demoContacts.v1",
      JSON.stringify([{ nonsense: true }]),
    );
    expect(listDemoContacts()).toEqual([]);
  });
});
