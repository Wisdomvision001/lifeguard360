import type { IconName } from "@/components/icons";

/**
 * Single source of truth for navigation (all three navs derive from this).
 * Guest-accessible items are flagged; account-gated items render for
 * registered users and prompt guests to sign in.
 */

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Show in the desktop topbar quick links. */
  inTopBar?: boolean;
  /** Show in the mobile bottom navigation. */
  inBottomBar?: boolean;
  /** Requires a registered account to be useful. */
  requiresAccount?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "Home", icon: "home", inTopBar: true, inBottomBar: true },
  { to: "/first-aid", label: "First Aid", icon: "first-aid", inTopBar: true, inBottomBar: true },
  { to: "/get-help", label: "Get Help Now", icon: "sos", inTopBar: true, inBottomBar: true },
  { to: "/facilities", label: "Facilities", icon: "facility" },
  { to: "/contacts", label: "Contacts", icon: "contacts", requiresAccount: true },
  { to: "/activity", label: "Activity", icon: "history", requiresAccount: true },
  { to: "/offline", label: "Offline First Aid", icon: "offline", requiresAccount: true },
  { to: "/profile", label: "Profile", icon: "user", inBottomBar: true },
] as const;

export const BOTTOM_NAV_MAX = 5;
