/**
 * Deployment sub-path support (GitHub Pages project site).
 *
 * `import.meta.env.BASE_URL` is "/" in development and the deploy sub-path
 * (e.g. "/lifeguard360/") in a production build configured via `base`.
 * Prefixing public/ asset paths keeps them valid in both environments.
 */
const BASE_URL: string = import.meta.env.BASE_URL;

/** Prefix a root-relative public/ asset path with the deploy base URL. */
export function assetPath(path: string): string {
  return `${BASE_URL}${path.replace(/^\//, "")}`;
}
