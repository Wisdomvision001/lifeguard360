/**
 * Explicit empty PostCSS config.
 *
 * PostCSS (via Vite) searches parent directories for config when none is
 * found locally; this file pins resolution to the project and prevents a
 * stray config from outside the repo (e.g. a Tailwind config on the user's
 * Desktop) from leaking into the build. Tailwind is intentionally not used —
 * styling is design tokens + CSS Modules.
 */
module.exports = { plugins: [] };
