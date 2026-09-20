import type { EmergencyContact } from "@/types";
import { toE164Nigerian } from "@/utils/phone";

/**
 * Duplicate-phone detection for Contacts (demo + authenticated modes).
 *
 * Both sides of the comparison are normalised through the app's existing
 * E.164 Nigerian normaliser (`toE164Nigerian`), so formatting differences
 * ("0801 234 5678", "08012345678", "2348012345678", "+2348012345678") can
 * never bypass the duplicate check.
 *
 * This is presentation-layer validation only: it runs at the application
 * boundary (ContactsPage) before either the demo store or contactService is
 * called. Firestore rules, Firebase Auth, and Storage are untouched — the
 * server-side rules remain the security authority.
 */

export const DUPLICATE_PHONE_MESSAGE = "This phone number is already in your contacts.";

/**
 * Return the existing contact that already holds the submitted phone number,
 * or null when no contact duplicates it. `excludeContactId` lets the caller
 * skip the contact being edited so keeping one's own number never counts as a
 * duplicate. Invalid input returns null — malformed numbers are the phone
 * schema's error to report, not this helper's.
 */
export function findDuplicateContactPhone(
  contacts: readonly EmergencyContact[],
  submittedPhone: string,
  excludeContactId: string | null = null,
): EmergencyContact | null {
  const submitted = toE164Nigerian(submittedPhone);
  if (submitted === null) return null;
  for (const contact of contacts) {
    if (excludeContactId !== null && contact.id === excludeContactId) continue;
    if (toE164Nigerian(contact.phoneNumber) === submitted) return contact;
  }
  return null;
}
