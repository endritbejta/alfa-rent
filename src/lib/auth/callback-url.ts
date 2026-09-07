export const DEFAULT_SIGN_IN_TARGET = "/admin/dashboard";

/**
 * Resolve a `?callbackUrl` against a throwaway origin and require it to stay
 * there, rather than pattern-matching the string.
 *
 * A `startsWith("/") && !startsWith("//")` check is not enough: the URL parser
 * normalizes backslashes to slashes and strips tabs in special schemes, so
 * `/\evil.com`, `/\/evil.com` and `/<TAB>/evil.com` all pass that test and
 * still resolve to another origin.
 *
 * This is the only guard on the value. LoginForm signs in with
 * `redirect: false` and navigates itself, so Auth.js's own same-origin check
 * never runs — which is what makes a bypass here a way to hand a staff member
 * to an attacker's page immediately after a genuine sign-in on the real
 * domain.
 *
 * Restricted to `/admin` because that is the only place sign-in leads.
 */
export function safeCallbackUrl(raw: string | undefined | null): string {
  if (!raw) return DEFAULT_SIGN_IN_TARGET;

  // Any absolute URL resolves away from this origin and is rejected below.
  const base = "http://callback.invalid";
  try {
    const url = new URL(raw, base);
    if (url.origin !== base) return DEFAULT_SIGN_IN_TARGET;
    if (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/")) {
      return DEFAULT_SIGN_IN_TARGET;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return DEFAULT_SIGN_IN_TARGET;
  }
}
