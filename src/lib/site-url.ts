/**
 * The public origin search engines and link previews should see.
 *
 * In order: an explicit SITE_URL, then the production domain Vercel exposes
 * on every deployment (so a preview's canonical tags still point at
 * production, not at its own throwaway URL), then AUTH_URL, which already
 * holds the deployed origin, and finally local development.
 */
export function siteUrl(): URL {
  const candidates = [
    process.env.SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL &&
      `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    process.env.AUTH_URL,
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    try {
      return new URL(value);
    } catch {
      // A malformed value falls through to the next source.
    }
  }
  return new URL("http://localhost:3000");
}

/** An absolute URL on the public site, e.g. absoluteUrl("/car"). */
export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl()).toString();
}

/**
 * Whether search engines may index this deployment. Only Vercel's
 * production environment is indexable: a preview is a full copy of the site
 * on another URL, and indexing it would split rankings with duplicates.
 * Outside Vercel, SITE_INDEXING=false opts out.
 */
export function siteIsIndexable(): boolean {
  if (process.env.SITE_INDEXING?.trim() === "false") return false;
  const vercelEnv = process.env.VERCEL_ENV;
  return vercelEnv === undefined || vercelEnv === "production";
}

/** Open Graph's locale tag for the language a page was rendered in. */
export function openGraphLocale(locale: string): string {
  return locale === "en" ? "en_US" : "sq_AL";
}
