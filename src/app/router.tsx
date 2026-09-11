import { Navigate, Route, Routes, useLocation } from "react-router";
import type { JSX } from "react";

import { AppLayout } from "@/layouts/AppLayout";
import { useAuth } from "@/app/providers/AuthProvider";

import { HomePage } from "@/pages/HomePage";
import { FirstAidPage } from "@/pages/FirstAidPage";
import { GuidePage } from "@/pages/GuidePage";
import { GetHelpPage } from "@/pages/GetHelpPage";
import { FacilitiesPage } from "@/pages/FacilitiesPage";
import { ContactsPage } from "@/pages/ContactsPage";
import { ActivityPage } from "@/pages/ActivityPage";
import { OfflineFirstAidPage } from "@/pages/OfflineFirstAidPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

/** Redirects guests to sign-in, preserving the intended destination. */
function RequireAccount({ children }: { children: JSX.Element }): JSX.Element {
  const { authState } = useAuth();
  const location = useLocation();

  if (authState.status === "loading") {
    return (
      <section aria-busy="true">
        <p>Loading your account…</p>
      </section>
    );
  }
  if (authState.status !== "signed-in") {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return children;
}

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="first-aid" element={<FirstAidPage />} />
        <Route path="first-aid/:categoryId" element={<GuidePage />} />
        <Route path="get-help" element={<GetHelpPage />} />
        <Route path="facilities" element={<FacilitiesPage />} />
        <Route
          path="contacts"
          element={
            <RequireAccount>
              <ContactsPage />
            </RequireAccount>
          }
        />
        <Route
          path="activity"
          element={
            <RequireAccount>
              <ActivityPage />
            </RequireAccount>
          }
        />
        <Route
          path="offline"
          element={
            <RequireAccount>
              <OfflineFirstAidPage />
            </RequireAccount>
          }
        />
        <Route
          path="profile"
          element={
            <RequireAccount>
              <ProfilePage />
            </RequireAccount>
          }
        />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
