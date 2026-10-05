import type { JSX } from "react";

import { OfflineProvider } from "@/app/providers/OfflineProvider";
import { AuthProvider } from "@/app/providers/AuthProvider";
import { FirstAidContentProvider } from "@/app/providers/FirstAidContentProvider";
import { AppRoutes } from "@/app/router";

export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <FirstAidContentProvider>
        <OfflineProvider>
          <AppRoutes />
        </OfflineProvider>
      </FirstAidContentProvider>
    </AuthProvider>
  );
}
