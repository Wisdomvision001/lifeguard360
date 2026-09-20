import type { EmergencyContact } from "@/types";

/**
 * Demo-mode contacts store (temporary, like the Admin Demo posture).
 *
 * While the app is in its supervised demo phase, signed-out visitors can add,
 * edit and remove contacts on the Contacts page. These records are kept ONLY
 * in this browser's localStorage under a dedicated namespace — they are never
 * written to Firestore. The real authenticated Contacts architecture
 * (contactService over users/{uid}/contacts, enforced by Firestore rules) is
 * untouched and remains the production path for signed-in users.
 *
 * Follows the established offlineContentService pattern: one versioned
 * `lifeguard360.*.v1` key, defensive JSON parsing, private-browsing-safe.
 */

const DEMO_CONTACTS_KEY = "lifeguard360.demoContacts.v1";

function isEmergencyContact(value: unknown): value is EmergencyContact {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.startsWith("demo-") &&
    typeof candidate.fullName === "string" &&
    typeof candidate.relationship === "string" &&
    typeof candidate.phoneNumber === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

/** Read the demo contacts for this browser. Returns [] when absent/corrupt. */
export function listDemoContacts(): EmergencyContact[] {
  try {
    const raw = window.localStorage.getItem(DEMO_CONTACTS_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop anything that does not match the EmergencyContact shape instead of
    // crashing — corrupt storage behaves like an empty demo list.
    return parsed.filter(isEmergencyContact);
  } catch {
    return [];
  }
}

/** Persist the full demo list. Throws only on unusable browser storage. */
function saveDemoContacts(contacts: EmergencyContact[]): void {
  try {
    window.localStorage.setItem(DEMO_CONTACTS_KEY, JSON.stringify(contacts));
  } catch (error) {
    throw new Error(
      "This browser is blocking local storage, so the demo contact cannot be saved.",
      { cause: error },
    );
  }
}

/** Create a demo contact locally. Never touches Firestore. */
export function addDemoContact(
  payload: Pick<EmergencyContact, "fullName" | "relationship" | "phoneNumber">,
): EmergencyContact {
  const now = new Date().toISOString();
  const contact: EmergencyContact = {
    // Demo-local deterministic-ish id, namespaced so it can never collide
    // with a Firestore document id.
    id: `demo-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`,
    ...payload,
    createdAt: now,
    updatedAt: now,
  };
  saveDemoContacts([contact, ...listDemoContacts()]);
  return contact;
}

/** Update a demo contact locally. Returns null when the id is not a demo id. */
export function updateDemoContact(
  contactId: string,
  payload: Pick<EmergencyContact, "fullName" | "relationship" | "phoneNumber">,
): EmergencyContact | null {
  if (!contactId.startsWith("demo-")) return null;
  const contacts = listDemoContacts();
  const index = contacts.findIndex((contact) => contact.id === contactId);
  if (index === -1) return null;
  const updated: EmergencyContact = {
    ...contacts[index],
    ...payload,
    updatedAt: new Date().toISOString(),
  };
  contacts[index] = updated;
  saveDemoContacts(contacts);
  return updated;
}

/** Delete a demo contact locally. Returns true when something was removed. */
export function deleteDemoContact(contactId: string): boolean {
  if (!contactId.startsWith("demo-")) return false;
  const contacts = listDemoContacts();
  const remaining = contacts.filter((contact) => contact.id !== contactId);
  saveDemoContacts(remaining);
  return remaining.length < contacts.length;
}
