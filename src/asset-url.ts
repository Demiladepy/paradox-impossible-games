/**
 * Where the generated assets actually live.
 *
 * In development the site is served from the root and `/assets/generated/x.glb` is correct.
 * On GitHub Pages the site is served from `/<repo>/`, so every absolute path like that
 * resolves to the user's root domain and 404s — the arena loads with no slabs, no
 * contestant and no props, which looks exactly like a broken build.
 *
 * Vite knows the answer: `BASE_URL` is whatever `base` was set to at build time, always
 * with a trailing slash. Routing every asset path through here means the same source
 * works served from a root or from a sub-path, and nothing has to remember which.
 *
 * The manifest stores paths root-relative too, so entries read from it go through this as
 * well rather than being used raw.
 */
export function assetUrl(path: string): string {
  // Already absolute (http://, https://, data:, blob:) — leave it alone.
  if (/^[a-z]+:/i.test(path)) return path;
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}
