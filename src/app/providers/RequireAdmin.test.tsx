import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { JSX } from "react";

import { RequireAdmin } from "@/app/providers/RequireAdmin";
import {
  isAdminClaim,
  toAdminAuthorization,
  type AdminAuthorization,
  type AdminAuthorizationObserver,
  type AuthState,
} from "@/services/auth/authService";

/**
 * Admin authorization foundation.
 *
 * Pins: there is NO development bypass in any environment; authorization
 * requires an authenticated, EMAIL-VERIFIED user whose ID token carries
 * admin === true (strict boolean); a missing/malformed claim denies; an
 * unverified mailbox denies with its own actionable state (never a
 * redirect); while authorization is unresolved no protected content
 * renders; denial redirects to /login preserving the intended destination.
 * The real security boundary remains Firestore/Storage rules — this guard
 * is UX only.
 */

afterEach(() => {
  cleanup();
});

// ------------------------------------------------------------------ helpers

/** Stand-in login route that reveals the preserved destination. */
function LoginLocation(): JSX.Element {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "none";
  return <div>login page (from: {from})</div>;
}

type GuardProps = Omit<Parameters<typeof RequireAdmin>[0], "children">;

/** Renders the guard at a protected admin route, with a login route available. */
function renderGuard(initialPath: string, props: GuardProps): void {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="admin/*"
          element={
            <RequireAdmin {...props}>
              <div>secret admin content</div>
            </RequireAdmin>
          }
        />
        <Route path="login" element={<LoginLocation />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Fake authorization observer that determines immediately on subscribe. */
function observerEmitting(authorization: AdminAuthorization): AdminAuthorizationObserver {
  return (onChange) => {
    onChange(authorization);
    return () => undefined;
  };
}

/** Fake observer that never determines — auth and/or claims still pending. */
function neverResolvingObserver(): AdminAuthorizationObserver {
  return () => () => undefined;
}

function signedInState(claims: Record<string, unknown>): AuthState {
  return {
    user: { uid: "user-1", email: "user@example.com", displayName: "User", emailVerified: true },
    profile: null,
    preferences: null,
    claims,
    status: "signed-in",
    error: null,
  };
}

// ----------------------------------------------- strict claim interpretation

describe("isAdminClaim — strict claim interpretation", () => {
  it("authorizes ONLY a real boolean true", () => {
    expect(isAdminClaim({ admin: true })).toBe(true);
  });

  it("denies non-boolean and malformed values", () => {
    expect(isAdminClaim({ admin: false })).toBe(false);
    expect(isAdminClaim({ admin: "true" })).toBe(false);
    expect(isAdminClaim({ admin: 1 })).toBe(false);
    expect(isAdminClaim({ admin: "1" })).toBe(false);
    expect(isAdminClaim({ admin: {} })).toBe(false);
  });

  it("denies a missing claim, and null/undefined claim maps", () => {
    expect(isAdminClaim({})).toBe(false);
    expect(isAdminClaim(null)).toBe(false);
    expect(isAdminClaim(undefined)).toBe(false);
  });
});

// --------------------------------------- production auth-state mapping (pure)

describe("toAdminAuthorization — production mapping", () => {
  it("maps a still-loading auth state to unresolved", () => {
    const loading: AuthState = { ...signedInState({ admin: true }), status: "loading" };
    expect(toAdminAuthorization(loading)).toEqual({ decision: "unresolved" });
  });

  it("maps signed-out to an unauthenticated denial", () => {
    const signedOut: AuthState = {
      user: null,
      profile: null,
      preferences: null,
      claims: {},
      status: "signed-out",
      error: null,
    };
    expect(toAdminAuthorization(signedOut)).toEqual({
      decision: "denied",
      reason: "unauthenticated",
    });
  });

  it("maps signed-in users without a strict admin claim to denial", () => {
    expect(toAdminAuthorization(signedInState({}))).toEqual({
      decision: "denied",
      reason: "claim-missing-or-invalid",
    });
    expect(toAdminAuthorization(signedInState({ admin: "true" }))).toEqual({
      decision: "denied",
      reason: "claim-missing-or-invalid",
    });
    expect(toAdminAuthorization(signedInState({ admin: 1 }))).toEqual({
      decision: "denied",
      reason: "claim-missing-or-invalid",
    });
  });

  it("maps signed-in users with admin === true to granted", () => {
    expect(toAdminAuthorization(signedInState({ admin: true }))).toEqual({
      decision: "granted",
    });
  });

  it("maps an unverified email to its own denial — even with the admin claim", () => {
    const unverified: AuthState = {
      ...signedInState({ admin: true }),
      user: {
        uid: "user-1",
        email: "user@example.com",
        displayName: "User",
        emailVerified: false,
      },
    };
    expect(toAdminAuthorization(unverified)).toEqual({
      decision: "denied",
      reason: "email-not-verified",
    });
  });
});// ------------------------------------------ the guard itself (claim-based posture)
describe("RequireAdmin — claim-based posture (no bypass of any kind)", () => {


  it("redirects an unauthenticated user to /login, preserving the destination", () => {
    renderGuard("/admin/users", {
      authorizationObserver: observerEmitting({ decision: "denied", reason: "unauthenticated" }),
    });
    expect(screen.queryByText("secret admin content")).not.toBeInTheDocument();
    expect(screen.getByText("login page (from: /admin/users)")).toBeInTheDocument();
  });

  it("denies an authenticated user whose claims lack admin === true", () => {
    renderGuard("/admin", {
      authorizationObserver: observerEmitting({
        decision: "denied",
        reason: "claim-missing-or-invalid",
      }),
    });
    expect(screen.queryByText("secret admin content")).not.toBeInTheDocument();
    expect(screen.getByText("login page (from: /admin)")).toBeInTheDocument();
  });

  it("grants an authenticated user whose ID token carries admin === true", () => {
    renderGuard("/admin", {
      authorizationObserver: observerEmitting({ decision: "granted" }),
    });
    expect(screen.getByText("secret admin content")).toBeInTheDocument();
    expect(screen.queryByText(/login page/)).not.toBeInTheDocument();
  });

  it("renders an actionable verify-email state — no redirect — for an unverified admin", () => {
    renderGuard("/admin", {
      authorizationObserver: observerEmitting({
        decision: "denied",
        reason: "email-not-verified",
      }),
    });
    expect(screen.queryByText("secret admin content")).not.toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/verify your email/i);
    // Signed in already: bouncing to a sign-in form would be wrong.
    expect(screen.queryByText(/login page/)).not.toBeInTheDocument();
  });

  it("renders an honest indeterminate state — never protected content — while unresolved", () => {
    renderGuard("/admin", {
      authorizationObserver: neverResolvingObserver(),
    });
    const pending = screen.getByText(/checking your authorization/i);
    expect(pending.closest('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText("secret admin content")).not.toBeInTheDocument();
    expect(screen.queryByText(/login page/)).not.toBeInTheDocument();
  });
});
