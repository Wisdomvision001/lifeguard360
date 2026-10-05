import { useEffect, useState, type JSX, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import {
  observeAdminAuthorization,
  type AdminAuthorization,
  type AdminAuthorizationObserver,
} from "@/services/auth/authService";

export interface RequireAdminProps {
  children: ReactNode;
  /** Injectable for tests; defaults to the real service. */
  authorizationObserver?: AdminAuthorizationObserver;
}

/**
 * PRODUCTION AUTHORIZATION (claims resolved here; rules elsewhere):
 *   Firebase Authentication -> signed-in user
 *     -> email verified (Firebase's real verification state)
 *     -> ID-token custom claim admin === true (strict boolean)
 *     -> RequireAdmin (UX protection only)
 *     -> AdminLayout -> admin pages
 * AND independently, as the real security boundary:
 *   Firestore / Storage rules -> request.auth.token.admin == true
 *
 * There is NO development bypass of any kind: every environment runs the
 * same claim-based check (a missing or malformed claim denies; an unverified
 * email denies with its own honest state). While auth and claims are still
 * unresolved the guard renders an indeterminate state and NEVER the protected
 * content. Denial redirects to /login preserving the intended destination —
 * except email-not-verified, where the signed-in user is told exactly what to
 * do instead of being bounced to a sign-in form they do not need.
 */
export function RequireAdmin({
  children,
  authorizationObserver = observeAdminAuthorization,
}: RequireAdminProps): JSX.Element {
  const location = useLocation();

  // Start unresolved: protected content never renders before authorization
  // has been determined.
  const [authorization, setAuthorization] = useState<AdminAuthorization>({
    decision: "unresolved",
  });

  useEffect(() => authorizationObserver(setAuthorization), [authorizationObserver]);

  // Indeterminate: auth and/or claims not yet resolved. No protected content.
  if (authorization.decision === "unresolved") {
    return (
      <section aria-busy="true">
        <p>Checking your authorization…</p>
      </section>
    );
  }

  // Signed-in admin candidate whose mailbox is not verified yet: an honest,
  // actionable state — not a redirect to a login form for an account that is
  // already signed in.
  if (
    authorization.decision === "denied" &&
    authorization.reason === "email-not-verified"
  ) {
    return (
      <section role="alert">
        <h1>Verify your email to use the admin area</h1>
        <p>
          Your account is signed in and carries the admin role, but your email
          address has not been verified yet. Open the verification email we
          sent you and follow the link, then reload this page. The verification
          notice at the top of the app has a “Resend” action if you need it.
        </p>
        <p>
          <a href="/">Back to the application</a>
        </p>
      </section>
    );
  }

  // Definitive denial (unauthenticated, or claim missing/malformed).
  if (authorization.decision !== "granted") {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
