import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  observeAuth,
  observeAdminAuthorization,
  isAdminClaim,
  toAdminAuthorization,
} from "@/services/auth/authService";
import type { AdminAuthorization, AuthState } from "@/services/auth/authService";

/**
 * Stage 2.5 auth hardening — integration tests for the REAL observeAuth.
 *
 * Only `firebase/auth` is mocked (the single Firebase seam observeAuth uses),
 * so the actual implementation runs end to end:
 *   onIdTokenChanged -> user projection -> getIdTokenResult(user) -> claims
 *   exposed on AuthState (with the emission-sequence staleness guard).
 *
 * Ordering is controlled with deterministic deferred promises and microtask
 * flushing — no timeouts, no timing-dependent assertions.
 */

const { getIdTokenResultMock, setAuthHandler, emitAuthState } = vi.hoisted(() => {
  const getIdTokenResultMock = vi.fn<(user: unknown) => Promise<{ claims: Record<string, unknown> }>>();
  let handler: ((user: unknown) => void) | null = null;
  const setAuthHandler = (next: (user: unknown) => void): void => {
    handler = next;
  };
  const emitAuthState = (user: unknown): void => {
    if (handler === null) throw new Error("observeAuth is not subscribed");
    handler(user);
  };
  return { getIdTokenResultMock, setAuthHandler, emitAuthState };
});

vi.mock("firebase/auth", () => ({
  getIdTokenResult: getIdTokenResultMock,
  onIdTokenChanged: vi.fn((_auth: unknown, onUser: (user: unknown) => void) => {
    setAuthHandler(onUser);
    return () => undefined;
  }),
  // Unused by observeAuth; present so the mocked module stays total for
  // every firebase/auth symbol authService imports.
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  linkWithCredential: vi.fn(),
  sendEmailVerification: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  GoogleAuthProvider: vi.fn(),
}));

vi.mock("@/services/firebase/client", () => ({
  isFirebaseConfigured: vi.fn(() => true),
  // currentUser must be truthy so refreshCurrentUser() performs the forced
  // token read (it no-ops only when nobody is signed in).
  getAuthInstance: vi.fn(() => ({ currentUser: { uid: "mock-current-user" } })),
  getDb: vi.fn(() => {
    throw new Error("observeAuth must never touch Firestore");
  }),
}));

/** Deterministic manually-resolved promise. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function firebaseUser(uid: string): {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
} {
  return { uid, email: `${uid}@example.com`, displayName: uid, emailVerified: true };
}

function tokenResult(claims: Record<string, unknown>): { claims: Record<string, unknown> } {
  return { claims };
}

/** Subscribes the REAL observeAuth and records every emitted state. */
function subscribe(): AuthState[] {
  const states: AuthState[] = [];
  observeAuth((state) => states.push(state));
  return states;
}

/**
 * Drains the microtask queue deterministically. observeAuth's only async work
 * is the getIdTokenResult promise chain, so a few microtask hops are always
 * enough — no arbitrary timeouts anywhere.
 */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  getIdTokenResultMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("observeAuth — real integration (Stage 2.5)", () => {
  it("Test A: exposes getIdTokenResult claims in the emitted AuthState", async () => {
    const states = subscribe();
    getIdTokenResultMock.mockResolvedValue(tokenResult({ admin: true }));

    emitAuthState(firebaseUser("user-a"));
    await flushMicrotasks();

    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      status: "signed-in",
      user: { uid: "user-a", emailVerified: true },
      claims: { admin: true },
      error: null,
    });
  });

  it("Test B: getIdTokenResult receives the authenticated Firebase user (and is skipped when signed out)", async () => {
    const states = subscribe();
    const user = firebaseUser("user-b");
    getIdTokenResultMock.mockResolvedValue(tokenResult({}));

    emitAuthState(user);
    await flushMicrotasks();
    expect(getIdTokenResultMock).toHaveBeenCalledTimes(1);
    expect(getIdTokenResultMock).toHaveBeenCalledWith(user);

    emitAuthState(null);
    await flushMicrotasks();
    // Sign-out never triggers a token read.
    expect(getIdTokenResultMock).toHaveBeenCalledTimes(1);
    expect(states).toHaveLength(2);
    expect(states[1]).toMatchObject({ status: "signed-out", user: null, claims: {} });
  });

  it("Test C: token-read failure is fail-closed — empty claims, denied for RequireAdmin", async () => {
    const states = subscribe();
    getIdTokenResultMock.mockRejectedValue(new Error("token read failed"));

    emitAuthState(firebaseUser("user-c"));
    await flushMicrotasks();

    expect(states).toHaveLength(1);
    expect(states[0].status).toBe("signed-in");
    expect(states[0].claims).toEqual({});
    expect(isAdminClaim(states[0].claims)).toBe(false);
    // Exactly what the guard consumes: a definitive, safe denial.
    expect(toAdminAuthorization(states[0])).toEqual({
      decision: "denied",
      reason: "claim-missing-or-invalid",
    });
  });

  it("Test D: a stale token result resolving after sign-out is ignored", async () => {
    const states = subscribe();
    const pendingA = deferred<{ claims: Record<string, unknown> }>();
    getIdTokenResultMock.mockReturnValue(pendingA.promise);

    // 1. User A signs in — token read stays pending, nothing emitted yet.
    emitAuthState(firebaseUser("user-a"));
    expect(states).toHaveLength(0);

    // 3. Firebase emits signed-out while A's token read is still pending.
    emitAuthState(null);
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ status: "signed-out", user: null, claims: {} });

    // 4. A's pending result finally resolves with admin claims — must be dropped.
    pendingA.resolve(tokenResult({ admin: true }));
    await flushMicrotasks();

    expect(states).toHaveLength(1); // no stale emission
    expect(states[0].status).toBe("signed-out");
    expect(states[0].claims).toEqual({});
  });

  it("Test F: observeAdminAuthorization decides on REFRESHED claims — the stale pre-grant snapshot is never emitted", async () => {
    const decisions: AdminAuthorization[] = [];
    // Call 1 = observeAuth's cached-token read: NO admin claim (stale).
    // Call 2 = the forced refresh before deciding: claim present server-side.
    getIdTokenResultMock
      .mockResolvedValueOnce(tokenResult({}))
      .mockResolvedValueOnce(tokenResult({ admin: true }));

    const unsubscribe = observeAdminAuthorization((authorization) =>
      decisions.push(authorization),
    );

    emitAuthState(firebaseUser("user-f"));
    // One microtask: observeAuth's stale emission has landed — and must be
    // HELD while the forced refresh runs. No decision from stale claims.
    await Promise.resolve();
    expect(decisions).toHaveLength(0);

    // Drain until the refresh chain settles.
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(getIdTokenResultMock).toHaveBeenCalledTimes(2);
    expect(getIdTokenResultMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      true,
    );
    // Exactly ONE decision, built from the FRESH claims: granted, not denied.
    expect(decisions).toEqual([{ decision: "granted" }]);
    unsubscribe();
  });

  it("Test G: an unauthenticated visitor is decided immediately — no token refresh round trip", () => {
    const decisions: AdminAuthorization[] = [];
    const unsubscribe = observeAdminAuthorization((authorization) =>
      decisions.push(authorization),
    );

    emitAuthState(null);
    // Synchronous: the public never waits on a network call to be denied.
    expect(decisions).toEqual([
      { decision: "denied", reason: "unauthenticated" },
    ]);
    expect(getIdTokenResultMock).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("Test E: User A's stale token result cannot overwrite User B's state", async () => {
    const states = subscribe();
    const pendingA = deferred<{ claims: Record<string, unknown> }>();
    getIdTokenResultMock
      .mockReturnValueOnce(pendingA.promise)
      .mockReturnValueOnce(Promise.resolve(tokenResult({ admin: false })));

    // 1. User A signs in; 2. their token result stays pending.
    emitAuthState(firebaseUser("user-a"));
    expect(states).toHaveLength(0);

    // 3. Firebase emits User B; 4. B's own token result resolves.
    emitAuthState(firebaseUser("user-b"));
    await flushMicrotasks();
    expect(states).toHaveLength(1);
    expect(states[0].user?.uid).toBe("user-b");
    expect(states[0].claims).toEqual({ admin: false });

    // 5. A's old token result resolves afterwards — must NOT overwrite B.
    pendingA.resolve(tokenResult({ admin: true }));
    await flushMicrotasks();

    expect(states).toHaveLength(1);
    expect(states[0].user?.uid).toBe("user-b");
    expect(states[0].claims).toEqual({ admin: false });
    expect(isAdminClaim(states[0].claims)).toBe(false);
  });
});
