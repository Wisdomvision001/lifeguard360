import { Link } from "react-router";
import type { JSX } from "react";

import { Card } from "@/components/Card";

/**
 * Temporary admin Users placeholder (Phase 1 - Task 1).
 * User administration arrives in its own phase.
 */
export function AdminUsersPage(): JSX.Element {
  return (
    <Card title="Users" titleIcon="user">
      <p>
        User management arrives in a later phase. This placeholder confirms the
        route is wired.
      </p>
      <p>
        <Link to="/admin">All admin sections</Link>
      </p>
    </Card>
  );
}
