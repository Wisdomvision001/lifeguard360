import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  getIdTokenResult,
  linkWithCredential,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type AuthCredential,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

import type { UserPreferences, UserProfile } from "@/types";
import { getAuthInstance, getDb, isFirebaseConfigured } from "@/services/firebase/client";
import { describeFirebaseError } from "@/services/firebase/db";

export type AuthUser = Pick<User, "uid" | "email" | "displayName"> & {
  /** Firebase Auth's real email-verification state (false until verified). */
  emailVerified: boolean;
};

/** Narrow input accepted by ensureUserDocument (verification state unused there). */
type UserIdentity = Pick<AuthUser, "uid" | "email" | "displayName">;

export interface AuthState {
  user: AuthUser | null;
  profile: UserProfile | null;
  preferences: UserPreferences | null;
  /**
   * Raw ID-token custom claims of the signed-in user ({} when signed out or
   * before the token result resolves). Consumers MUST gate authorization
   * through isAdminClaim — never interpret claim values directly.
   */
  claims: Record<string, unknown>;
  status: "loading" | "signed-out" | "signed-in";
  error: string | null;
}

const DEFAULT_PREFERENCES: Omit<UserPreferences, "language"> & { language: string } = {
  language: "en",
  ttsEnabled: true,
  commsNoticeAcknowledged: false,
};

/** Ensure users/{uid} exists with defaults. Idempotent. */
export async function ensureUserDocument(user: UserIdentity): Promise<void> {
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
    // Real Firebase verification email. Non-fatal: the account and profile
    // already exist, and the app shows a persistent "verify your email"
    // notice with a working resend action — so a transient email failure
    // never strands the user (registration itself already succeeded).
    try {
      await sendEmailVerification(credential.user);
    } catch {
      /* surfaced honestly by the verification notice + resend */
    }
    return toAuthUser(credential.user);
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
  };
}

/**
 * Re-send the verification email to the currently signed-in user.
 * Uses Firebase's real sendEmailVerification flow — no simulated states.
 */
export async function resendVerificationEmail(): Promise<void> {
  const user = getAuthInstance().currentUser;
  if (user === null) {
    throw new Error("Sign in first, then request a new verification email.");
  }
  try {
    await sendEmailVerification(user);
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

/**
 * Force-refresh the current user's ID token so emailVerified and custom
 * claims (e.g. a freshly granted admin claim) reflect the server state
 * immediately — no re-login, no waiting for the token's natural expiry.
 * observeAuth's onIdTokenChanged listener re-emits alongside this.
 *
 * Returns the FRESH ID-token claims, or null when nobody is signed in
 * (no-op). Rejects when the refresh itself fails, so callers can surface
 * the failure honestly instead of pretending the refresh happened.
 */
export async function refreshCurrentUser(): Promise<Record<string, unknown> | null> {
  const user = getAuthInstance().currentUser;
  if (user === null) return null;
  const result = await getIdTokenResult(user, true);
  return result.claims as Record<string, unknown>;
}

// ----------------------------------------------------------------------
// Google sign-in (real GoogleAuthProvider popup flow)
// ----------------------------------------------------------------------

/** Thrown when the Google identity's email matches an existing password
 * account: the popup cannot complete until the user proves ownership by
 * password, after which the Google credential is LINKED to that account. */
export class GoogleSignInLinkNeededError extends Error {
  readonly email: string;
  readonly credential: AuthCredential;
  constructor(email: string, credential: AuthCredential) {
    super(`An account with ${email} already exists with a password.`);
    this.name = "GoogleSignInLinkNeededError";
    this.email = email;
    this.credential = credential;
  }
}

/** Thrown when the user dismisses the Google popup — not an error state. */
export class GoogleSignInCancelledError extends Error {
  constructor() {
    super("Google sign-in was cancelled.");
    this.name = "GoogleSignInCancelledError";
  }
}

/**
 * "Continue with Google" — real signInWithPopup against Firebase Auth.
 * New Google accounts are created automatically by Firebase; existing Google
 * users sign in normally. Popup cancellation is a first-class outcome (never
 * an error the user has to dismiss), and a password-account collision throws
 * GoogleSignInLinkNeededError so the caller can complete provider linking.
 */
export async function signInWithGoogle(): Promise<AuthUser> {
  const provider = new GoogleAuthProvider();
  try {
    const credential = await signInWithPopup(getAuthInstance(), provider);
    await ensureUserDocument(credential.user);
    return toAuthUser(credential.user);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      throw new GoogleSignInCancelledError();
    }
    if (code === "auth/account-exists-with-different-credential") {
      const data = (error as { customData?: { email?: string; credential?: AuthCredential } })
        .customData;
      if (data?.email !== undefined && data.credential !== undefined) {
        throw new GoogleSignInLinkNeededError(data.email, data.credential);
      }
      throw new Error(
        "An account with this email already exists. Sign in with your password first.",
        { cause: error },
      );
    }
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

/**
 * Complete a Google sign-in that hit an existing password account:
 * sign in with the password, then LINK the pending Google credential to that
 * account (Firebase's documented account-linking path). Afterwards the single
 * account accepts both password and Google sign-in.
 */
export async function linkGoogleAccount(
  email: string,
  password: string,
  credential: AuthCredential,
): Promise<AuthUser> {
  try {
    const auth = getAuthInstance();
    const result = await signInWithEmailAndPassword(auth, email, password);
    try {
      await linkWithCredential(result.user, credential);
    } catch (linkError) {
      // Already linked (both providers on one account) — sign-in still succeeded.
      const code =
        typeof linkError === "object" && linkError !== null && "code" in linkError
          ? String((linkError as { code: unknown }).code)
          : "";
      if (code !== "auth/credential-already-in-use") throw linkError;
    }
    await ensureUserDocument(result.user);
    return toAuthUser(result.user);
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthUser> {
  try {
    const auth = getAuthInstance();
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserDocument(credential.user);
    return toAuthUser(credential.user);
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
    ...Object.fromEntries(
      Object.entries(preferences).map(([key, value]) => [`preferences.${key}`, value]),
    ),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Subscribe to auth state; calls onReady once the first determination lands.
 * Uses onIdTokenChanged (not onAuthStateChanged) so real token-level changes —
 * an admin claim grant taking effect, an email verification completing —
 * surface as fresh auth state without requiring a re-login.
 */
export function observeAuth(callback: (state: AuthState) => void): () => void {
  if (!isFirebaseConfigured()) {
    callback({ user: null, profile: null, preferences: null, claims: {}, status: "signed-out", error: null });
    return () => undefined;
  }
  const auth = getAuthInstance();
  // Emission-sequence guard (Stage 2.5 hardening): every auth-state emission
  // increments the sequence, so an async getIdTokenResult() result may only
  // update the auth state while it still belongs to the LATEST emission.
  // This closes the race where User A's pending token read resolves after a
  // sign-out or an account switch to User B — a stale result can never
  // overwrite a newer auth state. No second Firebase listener, no global
  // state; the guard is scoped to this single subscription.
  let emission = 0;
  return onIdTokenChanged(auth, (user: User | null) => {
    const thisEmission = ++emission;
    if (user === null) {
      callback({ user: null, profile: null, preferences: null, claims: {}, status: "signed-out", error: null });
      return;
    }
    const authUser: AuthUser = toAuthUser(user);
    // ID-token claims resolve with the token itself. On a transient token
    // failure the claims are exposed as empty — deny-by-default; a later
    // auth-state emission carries the real claims.
    void getIdTokenResult(user)
      .then((result) => {
        if (thisEmission !== emission) return; // superseded by a newer auth state
        callback({
          user: authUser,
          profile: null,
          preferences: null,
          claims: result.claims as Record<string, unknown>,
          status: "signed-in",
          error: null,
        });
      })
      .catch(() => {
        if (thisEmission !== emission) return;
        callback({
          user: authUser,
          profile: null,
          preferences: null,
          claims: {},
          status: "signed-in",
          error: null,
        });
      });
  });
}

// ============================================================================
// Admin authorization (Stage 1 — authorization foundation)
//
// Production target: Firebase Auth -> ID-token custom claim admin === true.
// The claim is inspected here for the RequireAdmin UX gate ONLY; the real
// security boundary is (and stays) Firestore/Storage rules evaluating
// request.auth.token.admin == true independently of anything in this file.
// ============================================================================

/** The honest authorization outcomes for the admin area. */
export type AdminAuthorization =
  /** Auth and/or claims not yet resolved — protected content MUST NOT render. */
  | { decision: "unresolved" }
  /** Definitive non-admin; the reason is diagnostics, never an authorization. */
  | {
      decision: "denied";
      reason: "unauthenticated" | "claim-missing-or-invalid" | "email-not-verified";
    }
  /** Signed-in, verified user whose ID token carries admin === true. */
  | { decision: "granted" };

export type AdminAuthorizationObserver =
  (callback: (authorization: AdminAuthorization) => void) => () => void;

/**
 * Strict claim check: ONLY a real boolean `true` authorizes. "true", 1, "1",
 * {} and an absent key are all non-admin — a claim must never be trusted via
 * truthiness.
 */
export function isAdminClaim(claims: Record<string, unknown> | null | undefined): boolean {
  return claims?.admin === true;
}

/**
 * Maps auth state onto an admin authorization decision. Claims are evaluated
 * strictly (isAdminClaim); missing or malformed values deny. Exported so the
 * exact production mapping — not a parallel reimplementation — is testable.
 */
export function toAdminAuthorization(state: AuthState): AdminAuthorization {
  if (state.status === "loading") return { decision: "unresolved" };
  if (state.status !== "signed-in" || state.user === null) {
    return { decision: "denied", reason: "unauthenticated" };
  }
  if (!isAdminClaim(state.claims)) {
    return { decision: "denied", reason: "claim-missing-or-invalid" };
  }
  // An unverified mailbox never administers the system, even with the claim:
  // defense in depth on top of the claim grant (which is only ever issued to
  // a verified address) and of course the Firestore/Storage rule boundary.
  if (state.user.emailVerified !== true) {
    return { decision: "denied", reason: "email-not-verified" };
  }
  return { decision: "granted" };
}

/**
 * Observes the signed-in user's admin authorization through the EXISTING auth
 * observer — no second Firebase listener, no second provider.
 *
 * Freshness guarantee: the FIRST decision for a signed-in user is made only
 * after one forced ID-token refresh (refreshCurrentUser), so authorization
 * reflects server-side truth — a claim granted moments ago — instead of a
 * possibly stale cached token. Until that refresh settles the guard stays in
 * its honest "unresolved" state; the stale pre-refresh snapshot is never
 * emitted (a just-granted admin must not be bounced to /login by the token
 * they had before the grant). Signed-out/loading states are decided
 * immediately — the public never waits on a network round trip. After the
 * first refresh, every onIdTokenChanged emission is decided as it arrives.
 */
export function observeAdminAuthorization(
  onChange: (authorization: AdminAuthorization) => void,
): () => void {
  let active = true;
  let latest: AuthState | null = null;
  let refreshing = false;
  let refreshedOnce = false;

  const emit = (state: AuthState): void => {
    if (active) onChange(toAdminAuthorization(state));
  };

  const unsubscribe = observeAuth((state) => {
    latest = state;
    if (state.status === "signed-in" && !refreshing && !refreshedOnce) {
      refreshing = true;
      void refreshCurrentUser()
        .catch(() => null) // refresh failed: decide on the claims we hold
        .then((freshClaims) => {
          refreshing = false;
          refreshedOnce = true;
          if (latest === null) return;
          emit(freshClaims === null ? latest : { ...latest, claims: freshClaims });
        });
      return; // hold the pre-refresh emission — see doc above
    }
    if (refreshing) return; // in-flight refresh owns the next decision
    emit(state);
  });

  return () => {
    active = false;
    unsubscribe();
  };
}
