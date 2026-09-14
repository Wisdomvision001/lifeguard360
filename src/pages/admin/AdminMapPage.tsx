import { Link } from "react-router";
import type { JSX } from "react";

import { Card } from "@/components/Card";

/**
 * Temporary admin Emergency Map placeholder (Phase 1 - Task 1).
 * Location & nearby medical facilities arrive in their own phase.
 */
export function AdminMapPage(): JSX.Element {
  return (
    <Card title="Location & Nearby Medical Facilities" titleIcon="map-pin">
      <p>
        The admin emergency map arrives in a later phase. This placeholder
        confirms the route is wired.
      </p>
      <p>
        <Link to="/admin">All admin sections</Link>
      </p>
    </Card>
  );
}
