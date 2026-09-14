import { Link } from "react-router";
import type { JSX } from "react";

import { Card } from "@/components/Card";

/**
 * Temporary admin Settings placeholder (Phase 1 - Task 1).
 * Settings tabs (account, application, legal, content, system) arrive in
 * their own phase; the route is structured so sub-routes can nest later.
 */
export function AdminSettingsPage(): JSX.Element {
  return (
    <Card title="Settings" titleIcon="settings">
      <p>
        Settings arrive in a later phase. This placeholder confirms the route
        is wired.
      </p>
      <p>
        <Link to="/admin">All admin sections</Link>
      </p>
    </Card>
  );
}
