import { Link } from "react-router";
import type { JSX } from "react";

import { Card } from "@/components/Card";

/**
 * Temporary admin Activity Log placeholder (Phase 1 - Task 1).
 * The admin audit trail arrives in its own phase.
 */
export function AdminActivityLogPage(): JSX.Element {
  return (
    <Card title="Activity Log" titleIcon="history">
      <p>
        The admin activity log arrives in a later phase. This placeholder
        confirms the route is wired.
      </p>
      <p>
        <Link to="/admin">All admin sections</Link>
      </p>
    </Card>
  );
}
