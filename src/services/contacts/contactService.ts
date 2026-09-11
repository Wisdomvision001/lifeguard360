import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import type { ContactRelationship, EmergencyContact } from "@/types";
import { getDb } from "@/services/firebase/client";
import { describeFirebaseError } from "@/services/firebase/db";
import { isValidE164Nigerian } from "@/utils/phone";

const RELATIONSHIPS: readonly string[] = [
  "Parent",
  "Sibling",
  "Spouse",
  "Friend",
  "Guardian",
  "Other",
];

/** Client-side structural check; Firestore rules remain the authority. */
function assertE164(value: string): void {
  if (!isValidE164Nigerian(value)) {
    throw new Error("Contact phone must be a valid E.164 Nigerian number (e.g. +2348012345678).");
  }
}

function toContact(id: string, data: Record<string, unknown>): EmergencyContact {
  return {
    id,
    fullName: typeof data.fullName === "string" ? data.fullName : "",
    relationship: (RELATIONSHIPS as readonly string[]).includes(String(data.relationship))
      ? (data.relationship as ContactRelationship)
      : "Other",
    phoneNumber: typeof data.phoneNumber === "string" ? data.phoneNumber : "",
    createdAt: "",
    updatedAt: "",
  };
}

export async function listContacts(uid: string): Promise<EmergencyContact[]> {
  try {
    const db = getDb();
    const ref = collection(db, "users", uid, "contacts");
    const snapshot = await getDocs(query(ref, orderBy("createdAt", "asc")));
    return snapshot.docs.map((docSnapshot) => toContact(docSnapshot.id, docSnapshot.data()));
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

export async function addContact(
  uid: string,
  input: { fullName: string; relationship: ContactRelationship; phoneNumber: string },
): Promise<string> {
  assertE164(input.phoneNumber);
  try {
    const db = getDb();
    const ref = collection(db, "users", uid, "contacts");
    const created = await addDoc(ref, {
      fullName: input.fullName,
      relationship: input.relationship,
      phoneNumber: input.phoneNumber,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return created.id;
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

export async function updateContact(
  uid: string,
  contactId: string,
  input: { fullName: string; relationship: ContactRelationship; phoneNumber: string },
): Promise<void> {
  assertE164(input.phoneNumber);
  try {
    const db = getDb();
    await updateDoc(doc(db, "users", uid, "contacts", contactId), {
      fullName: input.fullName,
      relationship: input.relationship,
      phoneNumber: input.phoneNumber,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

export async function deleteContact(uid: string, contactId: string): Promise<void> {
  try {
    const db = getDb();
    await deleteDoc(doc(db, "users", uid, "contacts", contactId));
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}
