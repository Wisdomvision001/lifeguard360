import { Link, useParams } from "react-router";
import type { JSX } from "react";

import { Card } from "@/components/Card";

/**
 * Temporary admin Guide Editor placeholder (Phase 1 - Task 1).
 * Renders the :categoryId route parameter to prove the nested route resolves.
 */
export function AdminGuideEditorPage(): JSX.Element {
  const { categoryId } = useParams<{ categoryId: string }>();
  return (
    <Card title="Guide Editor" titleIcon="first-aid">
      <p>
        Guide editing arrives in a later phase. This placeholder confirms the
        nested route resolves.
      </p>
      <p>
        Category parameter: <strong>{categoryId ?? "none"}</strong>
      </p>
      <p>
        <Link to="/admin">All admin sections</Link>
      </p>
    </Card>
  );
}
