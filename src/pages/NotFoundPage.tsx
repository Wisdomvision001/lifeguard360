import type { JSX } from "react";

import { Card } from "@/components/Card";
import { ButtonLink } from "@/components/Button";

export function NotFoundPage(): JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "var(--space-8) 0" }}>
      <Card title="Page not found" titleIcon="alert">
        <p style={{ marginBottom: "var(--space-4)" }}>
          The page you are looking for does not exist. If you arrived here during an emergency, use
          the buttons below to get help or find first-aid guidance.
        </p>
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <ButtonLink href="/get-help" variant="danger" icon="sos">
            Get Help Now
          </ButtonLink>
          <ButtonLink href="/first-aid" variant="outline" icon="first-aid">
            First Aid Guides
          </ButtonLink>
          <ButtonLink href="/" variant="outline" icon="home">
            Home
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
