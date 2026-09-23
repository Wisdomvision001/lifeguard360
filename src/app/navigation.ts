import type { IconName } from "@/components/icons";

/**
 * Single source of truth for navigation (sidebar and mobile bottom bar both
 * derive from this). Guest-accessible items are flagged; account-gated items
 * render for registered users and prompt guests to sign in.
 */

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Short label for the mobile bottom bar (falls back to `label`). */
  shortLabel?: string;
  /** Show in the mobile bottom navigation (max 5, incl. "More"). */
  inBottomBar?: boolean;
  /** Requires a registered account to be useful. */
  requiresAccount?: boolean;
  /**
   * Renders in the separated "Admin" section of the sidebar/drawer (in all
   * builds). Route access remains enforced by the RequireAdmin guard.
   */
  devOnly?: boolean;
}

const PUBLIC_NAV_ITEMS = [
  { to: "/", label: "Home", icon: "home", shortLabel: "Home", inBottomBar: true },
  {
    to: "/first-aid",
    label: "First Aid",
    icon: "first-aid",
    shortLabel: "First Aid",
    inBottomBar: true,
  },
  {
    to: "/get-help",
    label: "Get Help Now",
    icon: "sos",
    shortLabel: "SOS",
    inBottomBar: true,
  },
  {
    to: "/facilities",
    label: "Facilities",
    icon: "facility",
    shortLabel: "Hospitals",
    inBottomBar: true,
  },
  {
    to: "/contacts",
    // TEMPORARY DEMO MODE: guests get the browser-local demo store; the route
    // is already public. No requiresAccount — matches the Activity item.
    label: "Contacts",
    icon: "contacts",
    shortLabel: "Contacts",
    inBottomBar: true,
  },
  { to: "/activity", label: "Activity", icon: "history" },
  { to: "/offline", label: "Offline First Aid", icon: "offline", requiresAccount: true },
  { to: "/profile", label: "Profile", icon: "user", shortLabel: "Profile", inBottomBar: true },
] as const;

/**
 * Demo access to the /admin route branch, rendered in a separated sidebar
 * section in ALL builds. Temporary demo posture: /admin is intentionally
 * open while the Firestore/admin functionality is built; real Firebase
 * admin authentication will replace this later.
 */
const ADMIN_DEMO_NAV_ITEMS: readonly NavItem[] = [
  { to: "/admin", label: "Admin Demo", icon: "settings", devOnly: true },
];

export const NAV_ITEMS: readonly NavItem[] = [
  ...PUBLIC_NAV_ITEMS,
  ...ADMIN_DEMO_NAV_ITEMS,
];

export const BOTTOM_NAV_MAX = 5;
