import { describe, expect, it } from "vitest";

import {
  DUPLICATE_PHONE_MESSAGE,
  findDuplicateContactPhone,
} from "@/services/contacts/duplicatePhone";
import type { EmergencyContact } from "@/types";

/**
 * Duplicate-phone detection (unauthenticated + authenticated). Both sides of the
 * comparison go through toE164Nigerian, so formatting can never bypass the
 * check; the exclude-id keeps "keep my own number" edits from false-failing.
 */

function contact(id: string, fullName: string, phoneNumber: string): EmergencyContact {
  const now = "2026-01-01T00:00:00.000Z";
  return { id, fullName, relationship: "Parent", phoneNumber, createdAt: now, updatedAt: now };
}

const ADA = "+2348012345678"; // local form: 0801 234 5678

describe("findDuplicateContactPhone", () => {
  it("exposes the exact required user-facing message", () => {
    expect(DUPLICATE_PHONE_MESSAGE).toBe("This phone number is already in your contacts.");
  });

  it("allows the first occurrence of a phone number", () => {
    const contacts = [contact("a", "Ada", ADA)];
    expect(findDuplicateContactPhone(contacts, "0701 234 5678")).toBeNull();
  });

  it("detects an exact duplicate", () => {
    const contacts = [contact("a", "Ada", ADA)];
    expect(findDuplicateContactPhone(contacts, "08012345678")?.id).toBe("a");
  });

  it("rejects the third and fourth duplicates identically", () => {
    // The gate compares against the live contact list, so every additional
    // submission hits the same first matching contact — rejection never
    // degrades with repetition.
    const contacts = [
      contact("a", "Ada", ADA),
      contact("b", "Bola", "0902 345 6789"),
      contact("c", "Chidi", "+2348034567890"),
    ];
    const third = findDuplicateContactPhone(contacts, "08012345678");
    const fourth = findDuplicateContactPhone([...contacts, contact("d", "Dayo", "+2349012345678")], "0801 234 5678");
    expect(third?.id).toBe("a");
    expect(fourth?.id).toBe("a");
  });

  it("treats equivalent formatting as the same number", () => {
    const contacts = [contact("a", "Ada", "0801 234 5678")];
    // spacing, dashes, dots, parentheses, 234- and +234-prefixes all collapse
    // to the same E.164 value.
    for (const variant of [
      "+2348012345678",
      "2348012345678",
      "08012345678",
      "0801-234-5678",
      "0801.234.5678",
      "(0801) 234 5678",
    ]) {
      expect(findDuplicateContactPhone(contacts, variant)?.id).toBe("a");
    }
    expect(findDuplicateContactPhone(contacts, "0703 456 7890")).toBeNull();
  });

  it("editing a contact without changing its number succeeds (no false duplicate)", () => {
    const contacts = [contact("a", "Ada", ADA), contact("b", "Bola", "+2349023456789")];
    expect(findDuplicateContactPhone(contacts, "08012345678", "a")).toBeNull();
  });

  it("editing a contact to another contact's existing number is rejected", () => {
    const contacts = [contact("a", "Ada", ADA), contact("b", "Bola", "+2349023456789")];
    expect(findDuplicateContactPhone(contacts, "08012345678", "b")?.id).toBe("a");
  });

  it("returns null for malformed numbers (phone schema owns that error)", () => {
    expect(findDuplicateContactPhone([contact("a", "Ada", ADA)], "not-a-phone")).toBeNull();
    expect(findDuplicateContactPhone([contact("a", "Ada", ADA)], "")).toBeNull();
  });
});
