import { Link } from "react-router";
import type { JSX } from "react";

import { Card } from "@/components/Card";

/**
 * Admin-scoped not-found (Phase 1 - Task 1): unknown /admin/* paths stay
 * within the admin routing context instead of falling through to the public
 * 404 page, which is intentionally left unchanged.
 */
export function AdminNotFoundPage(): JSX.Element {
  return (
    <Card title="Page not found" titleIcon="alert">
      <p>The requested admin page does not exist.</p>
      <p>
        <Link to="/admin">Back to the admin dashboard</Link>
      </p>
    </Card>
  );
}
