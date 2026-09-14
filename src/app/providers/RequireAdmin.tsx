import { Navigate, useLocation } from "react-router";
import type { JSX, ReactNode } from "react";

export interface RequireAdminProps {
  children: ReactNode;
  /**
   * Injectable for tests (mirrors AuthProvider's injectable observer);
   * defaults to the real development-mode check.
   */
  isAdminEnvironment?: () => boolean;
}

function isDevEnvironment(): boolean {
  return import.meta.env.DEV;
}

/**
 * SINGLE admin guard boundary for the /admin route branch (Phase 1 - Task 2).
 *
 * CURRENT BEHAVIOUR - temporary development scaffolding, NOT production
 * security:
 *   - Development (vite dev server): access is allowed through so the admin
 *     area can be built and demoed.
 *   - Production build: `import.meta.env.DEV` is statically `false`, so the
 *     guard denies everyone and redirects to /login - the temporary dev
 *     bypass can never act as production authorization.
 *
 * PRODUCTION TARGET (later backend/security phase - not implemented here):
 *   Firebase Authentication -> signed-in user
 *     -> Firebase custom claim admin === true
 *     -> RequireAdmin (UX protection only)
 *     -> AdminLayout -> admin pages
 * The claim check will replace the dev-flag check inside this guard without
 * router or admin-page changes. Real authorization is enforced by Firestore
 * and Storage security rules, never by this client-side guard.
 *
 * Denied access reuses the existing RequireAccount contract: redirect to
 * /login preserving the intended destination.
 */
export function RequireAdmin({
  children,
  isAdminEnvironment = isDevEnvironment,
}: RequireAdminProps): JSX.Element {
  const location = useLocation();

  if (!isAdminEnvironment()) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}
