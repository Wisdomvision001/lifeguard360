import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

import type { UserPreferences, UserProfile } from "@/types";
import { getAuthInstance, getDb, isFirebaseConfigured } from "@/services/firebase/client";
import { describeFirebaseError } from "@/services/firebase/db";

export type AuthUser = Pick<User, "uid" | "email" | "displayName">;

export interface AuthState {
  user: AuthUser | null;
  profile: UserProfile | null;
  preferences: UserPreferences | null;
  status: "loading" | "signed-out" | "signed-in";
  error: string | null;
}

const DEFAULT_PREFERENCES: Omit<UserPreferences, "language"> & { language: string } = {
  language: "en",
  ttsEnabled: true,
  commsNoticeAcknowledged: false,
};

/** Ensure users/{uid} exists with defaults. Idempotent. */
export async function ensureUserDocument(user: AuthUser): Promise<void> {
  const db = getDb();
  const ref = doc(db, "users", user.uid);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    await setDoc(ref, {
      displayName: user.displayName ?? user.email?.split("@")[0] ?? "User",
      phone: null,
      preferences: DEFAULT_PREFERENCES,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function registerWithEmail(
  displayName: string,
  email: string,
  password: string,
): Promise<AuthUser> {
  try {
    const auth = getAuthInstance();
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName });
    await ensureUserDocument({ uid: credential.user.uid, email, displayName });
    return credential.user;
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthUser> {
  try {
    const auth = getAuthInstance();
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserDocument(credential.user);
    return credential.user;
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

export async function signOutUser(): Promise<void> {
  try {
    await signOut(getAuthInstance());
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

export async function sendPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(getAuthInstance(), email);
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

export async function loadUserProfile(uid: string): Promise<UserProfile | null> {
  const db = getDb();
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as Record<string, unknown>;
  return {
    uid,
    displayName: typeof data.displayName === "string" ? data.displayName : "User",
    phone: typeof data.phone === "string" ? data.phone : undefined,
    createdAt: "",
    updatedAt: "",
  };
}

export async function updateUserProfileFields(
  uid: string,
  fields: Partial<Pick<UserProfile, "displayName" | "phone">>,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "users", uid), { ...fields, updatedAt: serverTimestamp() });
}

export async function updatePreferences(
  uid: string,
  preferences: Partial<UserPreferences>,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "users", uid), {
    "preferences.updatedAt": serverTimestamp(),
    ...Object.fromEntries(
      Object.entries(preferences).map(([key, value]) => [`preferences.${key}`, value]),
    ),
  });
}

/** Subscribe to auth state; calls onReady once the first determination lands. */
export function observeAuth(callback: (state: AuthState) => void): () => void {
  if (!isFirebaseConfigured()) {
    callback({ user: null, profile: null, preferences: null, status: "signed-out", error: null });
    return () => undefined;
  }
  const auth = getAuthInstance();
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user === null) {
      callback({ user: null, profile: null, preferences: null, status: "signed-out", error: null });
      return;
    }
    const authUser: AuthUser = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
    };
    callback({
      user: authUser,
      profile: null,
      preferences: null,
      status: "signed-in",
      error: null,
    });
  });
}
