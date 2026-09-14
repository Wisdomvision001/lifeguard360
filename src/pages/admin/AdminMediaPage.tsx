import { Link } from "react-router";
import type { JSX } from "react";

import { Card } from "@/components/Card";

/**
 * Temporary admin Media placeholder (Phase 1 - Task 1).
 * The media registry arrives in its own phase.
 */
export function AdminMediaPage(): JSX.Element {
  return (
    <Card title="Media" titleIcon="upload">
      <p>
        Media management arrives in a later phase. This placeholder confirms
        the route is wired.
      </p>
      <p>
        <Link to="/admin">All admin sections</Link>
      </p>
    </Card>
  );
}
