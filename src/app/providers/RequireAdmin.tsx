import { Navigate, useLocation } from "react-router";
import type { JSX, ReactNode } from "react";

export interface RequireAdminProps {
  children: ReactNode;
  /**
   * Injectable for tests (mirrors AuthProvider's injectable observer);
   * defaults to the temporary demo-allow check below.
   */
  isAdminEnvironment?: () => boolean;
}

/**
 * TEMPORARY DEMO POSTURE (until real admin authentication lands): the guard
 * allows everyone through so /admin is directly accessible while the
 * Firestore/admin functionality is built and tested — no email, password,
 * or Firebase authentication required.
 *
 * PRODUCTION TARGET (later backend/security phase — not implemented here):
 *   Firebase Authentication -> signed-in user
 *     -> Firebase custom claim admin === true
 *     -> RequireAdmin (UX protection only)
 *     -> AdminLayout -> admin pages
 * The claim check will replace the demo-allow default inside this guard
 * without router or admin-page changes. Real authorization is enforced by
 * Firestore and Storage security rules, never by this client-side guard.
 *
 * The injectable isAdminEnvironment keeps the deny path (redirect to /login
 * preserving the intended destination) testable until then.
 */
function isDemoAccessEnabled(): boolean {
  return true;
}
export function RequireAdmin({
  children,
  isAdminEnvironment = isDemoAccessEnabled,
}: RequireAdminProps): JSX.Element {
  const location = useLocation();

  if (!isAdminEnvironment()) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}
