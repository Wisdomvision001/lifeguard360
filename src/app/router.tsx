import { Navigate, Route, Routes, useLocation } from "react-router";
import type { JSX } from "react";

import { AppLayout } from "@/layouts/AppLayout";
import { useAuth } from "@/app/providers/AuthProvider";

import { HomePage } from "@/pages/HomePage";
import { FirstAidPage } from "@/pages/FirstAidPage";
import { GuidePage } from "@/pages/GuidePage";
import { GuideStepByStepPage } from "@/pages/GuideStepByStepPage";
import { GuideQuickPage } from "@/pages/GuideQuickPage";
import { GetHelpPage } from "@/pages/GetHelpPage";
import { FacilitiesPage } from "@/pages/FacilitiesPage";
import { ContactsPage } from "@/pages/ContactsPage";
import { ActivityPage } from "@/pages/ActivityPage";
import { OfflineFirstAidPage } from "@/pages/OfflineFirstAidPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

import { RequireAdmin } from "@/app/providers/RequireAdmin";
import { AdminLayout } from "@/layouts/AdminLayout";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { AdminMapPage } from "@/pages/admin/AdminMapPage";
import { AdminFirstAidPage } from "@/pages/admin/AdminFirstAidPage";
import { AdminGuideEditorPage } from "@/pages/admin/AdminGuideEditorPage";
import { AdminMediaPage } from "@/pages/admin/AdminMediaPage";
import { AdminUsersPage } from "@/pages/admin/AdminUsersPage";
import { AdminAnalyticsPage } from "@/pages/admin/AdminAnalyticsPage";
import { AdminActivityLogPage } from "@/pages/admin/AdminActivityLogPage";
import { AdminSettingsPage } from "@/pages/admin/AdminSettingsPage";
import { AdminNotFoundPage } from "@/pages/admin/AdminNotFoundPage";

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
        <Route
          path="first-aid/:categoryId/quick"
          element={<GuideQuickPage />}
        />
        <Route
          path="first-aid/:categoryId/steps"
          element={<GuideStepByStepPage />}
        />
        <Route path="get-help" element={<GetHelpPage />} />
        <Route path="facilities" element={<FacilitiesPage />} />
        {/* TEMPORARY DEMO MODE (Admin Demo posture): contacts is reachable
            signed-out. Signed-out visitors use the browser-local demo store;
            signed-in users get the real users/{uid}/contacts architecture.
            RequireAccount returns here when final auth hardening lands. */}
        <Route path="contacts" element={<ContactsPage />} />
        {/* TEMPORARY DEMO MODE (Admin Demo posture): activity is reachable
            signed-out. Signed-out visitors get a browser-local demo activity
            history; signed-in users keep the real users/{uid}/activity
            architecture. RequireAccount returns here when final auth
            hardening lands. */}
        <Route path="activity" element={<ActivityPage />} />
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

      {/* -------------------------------------------------------------- admin
          Admin route branch (Phase 1). RequireAdmin is a temporary passthrough
          until real admin auth lands in the next task; AdminLayout is a
          passthrough until the admin shell lands. Unknown /admin/* paths fall
          through to the admin-scoped not-found, never the public 404. */}
      <Route
        path="admin"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="map" element={<AdminMapPage />} />
        <Route path="first-aid" element={<AdminFirstAidPage />} />
        <Route path="first-aid/:categoryId" element={<AdminGuideEditorPage />} />
        <Route path="media" element={<AdminMediaPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="analytics" element={<AdminAnalyticsPage />} />
        <Route path="activity" element={<AdminActivityLogPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
        <Route path="*" element={<AdminNotFoundPage />} />
      </Route>
    </Routes>
  );
}
