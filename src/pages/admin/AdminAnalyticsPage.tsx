import { Link } from "react-router";
import type { JSX } from "react";

import { Card } from "@/components/Card";

/**
 * Temporary admin Analytics placeholder (Phase 1 - Task 1).
 * Real, event-derived analytics arrive in their own phase.
 */
export function AdminAnalyticsPage(): JSX.Element {
  return (
    <Card title="Analytics">
      <p>
        Analytics arrive in a later phase. This placeholder confirms the route
        is wired.
      </p>
      <p>
        <Link to="/admin">All admin sections</Link>
      </p>
    </Card>
  );
}
