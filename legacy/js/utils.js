/* ==========================================================================
   Lifeguard360 — utils.js
   Small, dependency-free helper functions used across pages.
   ========================================================================== */

const Utils = (() => {
  /** Shorthand querySelector */
  function qs(selector, scope = document) {
    return scope.querySelector(selector);
  }

  /** Shorthand querySelectorAll → real array */
  function qsa(selector, scope = document) {
    return Array.from(scope.querySelectorAll(selector));
  }

  /**
   * Format a distance in metres/kilometres for display.
   * @param {number} meters
   * @returns {string}
   */
  function formatDistance(meters) {
    if (meters == null || Number.isNaN(meters)) return "—";
    if (meters < 1000) return `${Math.round(meters)} m away`;
    return `${(meters / 1000).toFixed(1)} km away`;
  }

  /**
   * Format a timestamp as a short, human-readable date/time.
   * @param {number|string|Date} value
   * @returns {string}
   */
  function formatTimestamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-NG", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /**
   * Read a query-string parameter from the current URL.
   * @param {string} name
   * @returns {string|null}
   */
  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  return { qs, qsa, formatDistance, formatTimestamp, getQueryParam };
})();
