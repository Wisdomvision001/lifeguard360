import { useEffect, useState, type JSX } from "react";
import { NavLink, Outlet, Link } from "react-router";

import { NAV_ITEMS } from "@/app/navigation";
import { BrandMark, Icon } from "@/components/icons";
import { useAuth } from "@/app/providers/AuthProvider";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import styles from "@/layouts/AppLayout.module.css";

/**
 * App shell ported from the legacy prototype: fixed sidebar on desktop,
 * off-canvas drawer below 720px (with overlay + Escape to close), sticky
 * topbar with honest online/offline state, and mobile bottom navigation.
 */
export function AppLayout(): JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { authState } = useAuth();
  const online = useOnlineStatus();
  const signedIn = authState.status === "signed-in";

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  const items = NAV_ITEMS.filter((item) => !item.requiresAccount || signedIn);
  const bottomItems = items
    .filter((item) => item.inBottomBar === true)
    .slice(0, 5);
  // "Admin" entry, rendered in its separated sidebar section in all
  // builds. Temporary posture: /admin is intentionally open until real
  // Firebase admin authentication is implemented.
  const devItems = items.filter((item) => item.devOnly === true);

  const initials =
    authState.user?.displayName
      ?.split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "U";

  return (
    <>
      {drawerOpen && (
        <button
          type="button"
          className={styles.overlay}
          aria-label="Close navigation menu"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div className={styles.appShell}>
        <aside
          id="sidebar"
          className={`${styles.sidebar} ${drawerOpen ? styles.sidebarOpen : ""}`}
          aria-label="Primary"
        >
          <Link to="/" className={styles.brand} onClick={() => setDrawerOpen(false)}>
            <BrandMark />
            <span className={styles.brandText}>
              <span className={styles.brandName}>
                LIFEGUARD<span>360</span>
              </span>
              <span className={styles.brandTagline}>First Aid. Emergency Help. Life Saving.</span>
            </span>
          </Link>

          <nav className={styles.nav}>
            {items
              .filter((item) => item.devOnly !== true)
              .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`
                }
                onClick={() => setDrawerOpen(false)}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
              </NavLink>
              ))}
            {devItems.length > 0 && (
              <div className={styles.devSection}>
                {devItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`
                    }
                    onClick={() => setDrawerOpen(false)}
                  >
                    <Icon name={item.icon} size={18} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
            {!signedIn && (
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`
                }
                onClick={() => setDrawerOpen(false)}
              >
                <Icon name="logout" size={18} />
                Sign in
              </NavLink>
            )}
          </nav>

          <div className={styles.footer}>
            <Icon name="heart-pulse" size={28} className={styles.footerIcon} />
            <p className={styles.footerTitle}>Save a Life</p>
            <p className={styles.footerCopy}>Learn First Aid. Be Prepared.</p>
          </div>
        </aside>

        <div className={styles.main}>
          <header className={styles.topbar}>
            <button
              type="button"
              className={styles.menuToggle}
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
              aria-controls="sidebar"
              onClick={() => setDrawerOpen(true)}
            >
              <Icon name="menu" size={22} />
            </button>

            <div className={styles.topbarActions}>
              <span className={styles.onlinePill} aria-live="polite">
                <span
                  className={online ? styles.dotOnline : styles.dotOffline}
                  aria-hidden="true"
                />
                {online ? "Online" : "Offline"}
              </span>
              {signedIn ? (
                <Link to="/profile" className={styles.avatar} aria-label="Your profile">
                  {initials}
                </Link>
              ) : (
                <Link to="/login" className={styles.signInLink}>
                  Sign in
                </Link>
              )}
            </div>
          </header>

          <main className={styles.content} id="mainContent">
            <Outlet />
          </main>

          <footer className={styles.contentFooter}>
            <span>© 2026 Lifeguard360 — Your Safety Companion in Emergencies</span>
            <span>Made for a safer Nigeria</span>
          </footer>

          <nav className={styles.bottomNav} aria-label="Primary mobile">
            {bottomItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `${styles.bottomNavLink} ${isActive ? styles.bottomNavLinkActive : ""}`
                }
              >
                <Icon name={item.icon} size={20} />
                {item.to === "/get-help" ? "SOS" : item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}
