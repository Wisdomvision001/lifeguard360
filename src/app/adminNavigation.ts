import type { IconName } from "@/components/icons";

/**
 * Single source of truth for admin navigation (the admin sidebar derives from
 * this). Deliberately separate from src/app/navigation.ts — public and admin
 * navigation are different concerns and must not leak into each other.
 */
export interface AdminNavItem {
  to: string;
  label: string;
  icon: IconName;
  /**
   * Exact-match only. Used for the Dashboard index so it is not reported
   * active on every /admin/* route; section items intentionally stay active
   * on their nested routes (e.g. /admin/first-aid/burns).
   */
  end?: boolean;
}

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { to: "/admin", label: "Dashboard", icon: "home", end: true },
  { to: "/admin/map", label: "Medical Facilities", icon: "facility" },
  { to: "/admin/first-aid", label: "First-Aid Content", icon: "first-aid" },
  { to: "/admin/media", label: "Media", icon: "upload" },
  { to: "/admin/users", label: "Users", icon: "user" },
  { to: "/admin/analytics", label: "Analytics", icon: "heart-pulse" },
  { to: "/admin/activity", label: "Activity Log", icon: "history" },
  { to: "/admin/settings", label: "Settings", icon: "settings" },
] as const;

/** Longest-prefix match so nested routes keep their section highlighted; null when no section matches (admin not-found). */
export function findAdminNavItem(pathname: string): AdminNavItem | null {
  return (
    [...ADMIN_NAV_ITEMS]
      .sort((a, b) => b.to.length - a.to.length)
      .find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)) ?? null
  );
}
