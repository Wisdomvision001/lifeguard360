import { useEffect, useState, type JSX } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router";

import { ADMIN_NAV_ITEMS, findAdminNavItem } from "@/app/adminNavigation";
import { BrandMark, Icon } from "@/components/icons";
import styles from "@/layouts/AdminLayout.module.css";

/**
 * Admin shell (Phase 1 - Task 3): same visual language as the public
 * AppLayout — navy sidebar, drawer below 1024px with overlay + Escape, sticky
 * topbar — but scoped to the administration area with its own navigation
 * data. No public navigation and no mobile bottom nav inside /admin.
 */
export function AdminLayout(): JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close the drawer whenever the route changes (selection or back/forward)
  // using React's adjust-state-during-render pattern.
  const [prevPathname, setPrevPathname] = useState(location.pathname);
  if (prevPathname !== location.pathname) {
    setPrevPathname(location.pathname);
    setDrawerOpen(false);
  }

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  // Longest-prefix match keeps the section highlighted on nested routes
  // (e.g. /admin/first-aid/burns stays "First-Aid Content").
  const current = findAdminNavItem(location.pathname);

  return (
    <>
      {drawerOpen && (
        <button
          type="button"
          className={styles.overlay}
          aria-label="Close admin navigation menu"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div className={styles.adminShell}>
        <aside
          id="adminSidebar"
          className={`${styles.sidebar} ${drawerOpen ? styles.sidebarOpen : ""}`}
          aria-label="Admin"
        >
          <Link to="/admin" className={styles.brand} onClick={() => setDrawerOpen(false)}>
            <BrandMark />
            <span className={styles.brandText}>
              <span className={styles.brandName}>
                LIFEGUARD<span>360</span>
              </span>
              <span className={styles.brandTagline}>Admin</span>
            </span>
          </Link>

          <nav className={styles.nav} aria-label="Admin sections">
            {ADMIN_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end === true}
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`
                }
                onClick={() => setDrawerOpen(false)}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <p className={styles.sidebarNote}>
            Administration area — development preview.
          </p>
        </aside>

        <div className={styles.main}>
          <header className={styles.topbar}>
            <button
              type="button"
              className={styles.menuToggle}
              aria-label="Open admin navigation menu"
              aria-expanded={drawerOpen}
              aria-controls="adminSidebar"
              onClick={() => setDrawerOpen(true)}
            >
              <Icon name="menu" size={22} />
            </button>

            <div className={styles.topbarTitle}>
              <span className={styles.topbarAdmin}>Admin</span>
              <span className={styles.topbarSection}>
                {current?.label ?? "Not found"}
              </span>
            </div>

            <div className={styles.topbarActions}>
              <Link to="/" className={styles.publicLink}>
                <Icon name="external" size={16} />
                View public site
              </Link>
            </div>
          </header>

          <main className={styles.content} id="adminContent">
            <Outlet />
          </main>

          <footer className={styles.contentFooter}>
            <span>© 2026 Lifeguard360 — Administration</span>
            <span>First aid content managed here serves the public app</span>
          </footer>
        </div>
      </div>
    </>
  );
}
