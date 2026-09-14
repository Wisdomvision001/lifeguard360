import { Link } from "react-router";
import type { JSX } from "react";

import { Card } from "@/components/Card";

/**
 * Temporary admin First-Aid Content placeholder (Phase 1 - Task 1).
 * The guide registry and editor arrive in their own phase.
 */
export function AdminFirstAidPage(): JSX.Element {
  return (
    <Card title="First-Aid Content" titleIcon="first-aid">
      <p>
        First-aid content management arrives in a later phase. This placeholder
        confirms the route is wired.
      </p>
      <p>
        <Link to="/admin">All admin sections</Link>
      </p>
    </Card>
  );
}
