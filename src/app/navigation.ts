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
   * DEV-ONLY: rendered in a separated "Dev" section of the sidebar/drawer and
   * only in development builds. TEMPORARY — remove when real Firebase admin
   * authentication replaces the temporary RequireAdmin guard.
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
    label: "Contacts",
    icon: "contacts",
    shortLabel: "Contacts",
    requiresAccount: true,
    inBottomBar: true,
  },
  { to: "/activity", label: "Activity", icon: "history", requiresAccount: true },
  { to: "/offline", label: "Offline First Aid", icon: "offline", requiresAccount: true },
  { to: "/profile", label: "Profile", icon: "user", shortLabel: "Profile", inBottomBar: true },
] as const;

/**
 * DEV-ONLY (temporary): development/demo access to the /admin route branch,
 * rendered in a separated sidebar section. Statically stripped from production
 * builds via the import.meta.env.DEV ternary. Remove this block entirely when
 * real Firebase admin authentication is implemented.
 */
const DEV_NAV_ITEMS: readonly NavItem[] = [
  { to: "/admin", label: "Admin Demo", icon: "settings", devOnly: true },
];

export const NAV_ITEMS: readonly NavItem[] = import.meta.env.DEV
  ? [...PUBLIC_NAV_ITEMS, ...DEV_NAV_ITEMS]
  : PUBLIC_NAV_ITEMS;

export const BOTTOM_NAV_MAX = 5;
