/* ==========================================================================
   Lifeguard360 — app.js
   Shared app-shell behaviour: mobile sidebar (off-canvas) toggle and
   active-link highlighting. Page-specific logic lives in its own file
   (emergency.js, location.js, hospitals.js, contacts.js, alerts.js) and
   is added as each stage is built — see the project brief's staged plan.
   ========================================================================== */

(function initAppShell() {
  const sidebar = Utils.qs("#sidebar");
  const overlay = Utils.qs("#sidebarOverlay");
  const menuToggle = Utils.qs("#menuToggle");

  function openSidebar() {
    if (!sidebar || !overlay || !menuToggle) return;
    sidebar.classList.add("is-open");
    overlay.classList.add("is-open");
    menuToggle.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    if (!sidebar || !overlay || !menuToggle) return;
    sidebar.classList.remove("is-open");
    overlay.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
  }

  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      const isOpen = sidebar.classList.contains("is-open");
      isOpen ? closeSidebar() : openSidebar();
    });
  }

  if (overlay) {
    overlay.addEventListener("click", closeSidebar);
  }

  // Close the drawer on Escape for keyboard users.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSidebar();
  });

  // Close the drawer automatically if the viewport grows past mobile width.
  window.addEventListener("resize", () => {
    if (window.innerWidth > 720) closeSidebar();
  });
})();
