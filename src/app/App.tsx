import type { JSX } from "react";

import { OfflineProvider } from "@/app/providers/OfflineProvider";
import { AuthProvider } from "@/app/providers/AuthProvider";
import { AppRoutes } from "@/app/router";

export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <OfflineProvider>
        <AppRoutes />
      </OfflineProvider>
    </AuthProvider>
  );
}
