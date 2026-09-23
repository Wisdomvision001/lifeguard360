import { describe, expect, it } from "vitest";

import { NAV_ITEMS } from "@/app/navigation";

/**
 * Navigation/guard consistency (Guest Mode tasks 1–3).
 *
 * Pins the navigation contract for the temporary demo posture: routes that
 * are public (contacts, activity — reachable signed-out with browser-local
 * demo storage) must NOT carry `requiresAccount`, so AppLayout does not hide
 * them from guests. Account-gated routes (offline, profile) keep the flag.
 */

function itemFor(path: string) {
  const item = NAV_ITEMS.find((navItem) => navItem.to === path);
  expect(item, `expected a nav item for ${path}`).toBeTruthy();
  return item as (typeof NAV_ITEMS)[number];
}

describe("navigation items (normal user)", () => {
  it("contacts is reachable signed-out: no requiresAccount flag", () => {
    expect(itemFor("/contacts").requiresAccount).toBeUndefined();
  });

  it("activity is reachable signed-out: no requiresAccount flag", () => {
    expect(itemFor("/activity").requiresAccount).toBeUndefined();
  });

  it("offline first aid remains account-gated", () => {
    expect(itemFor("/offline").requiresAccount).toBe(true);
  });

  it("profile has no nav flag (route-level RequireAccount handles gating)", () => {
    // Known intentional state: the Profile route is wrapped in RequireAccount,
    // so the nav item needs no flag. Do not change Profile in this task.
    expect(itemFor("/profile").requiresAccount).toBeUndefined();
  });

  it("every normal-user nav item points at its route path", () => {
    for (const item of NAV_ITEMS) {
      expect(item.to.startsWith("/"), `${item.to} must be an absolute path`).toBe(true);
    }
  });
});
