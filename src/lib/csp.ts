/**
 * The Content Security Policy, built per request.
 *
 * Why a nonce and not a static header: Next.js inlines its own bootstrap
 * scripts (`self.__next_f.push(…)`), and next-themes inlines the script that
 * sets the theme class before first paint. Without `'unsafe-inline'` — which
 * would make `script-src` worthless — the only way to allow exactly those
 * scripts is a nonce minted per response. Next reads it back out of the
 * request's `Content-Security-Policy` header and stamps it on every script it
 * renders (see node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
 *
 * THE COST: a nonce makes every page dynamic. A statically rendered or
 * CDN-cached page would serve one nonce to everybody, which is the same as
 * having none. Every page here is already dynamic because the locale lives in
 * a cookie (audit P2-10), so this costs nothing today. When P2-10 makes the
 * storefront static, the storefront needs a different answer — Next's
 * experimental SRI (hash-based) mode, or `'unsafe-inline'` scripts behind
 * `'strict-dynamic'` — and this module is the place to make that choice.
 *
 * Rollout: the nonce policy ships as `Content-Security-Policy-Report-Only`
 * until `CSP_ENFORCE=true` is set (see `cspEnforced`). The directives that
 * need no nonce — `base-uri`, `form-action`, `object-src`, `frame-ancestors`
 * — are enforced from next.config.ts in both modes (see baselineDirectives
 * for why there), so the report-only phase loosens nothing.
 */

/**
 * Every third-party origin the browser is allowed to reach. Keep this list
 * short and say why each one is here; the PR that adds an origin should be
 * able to point at the line of code that needs it.
 */
export const CSP_ORIGINS = {
  /** Vehicle and inspection photos, via next/image's Cloudinary loader. */
  cloudinaryDelivery: "https://res.cloudinary.com",
  /** Signed direct uploads from the browser (media-grid, inspection photos). */
  cloudinaryUpload: "https://api.cloudinary.com",
  /** The portfolio embeds the storefront in an iframe (next.config.ts history). */
  portfolio: "https://endritsportfolio.netlify.app",
} as const;

export const CSP_REPORT_PATH = "/api/csp-report";
/** The `report-to` group name, matched by the `Reporting-Endpoints` header. */
export const CSP_REPORT_GROUP = "csp-endpoint";

/**
 * Routes nobody has a reason to frame. The admin and the sign-in page are
 * where clickjacking would matter; `/account` is the staff password page.
 */
export function isFramingDenied(pathname: string): boolean {
  return framingFor(pathname) === "none";
}

/**
 * The printable sheets. The admin prints them by loading one into a hidden
 * same-origin <iframe> and calling print() on it (src/lib/print-reservation.ts),
 * which needs no popup window and so no popup-blocker exception. They may be
 * framed by this origin only: a read-only page whose one control is Print
 * gives a clickjacker nothing, and no other origin can frame it.
 */
export const PRINT_PATH_PREFIX = "/admin/print/";

/**
 * Who may frame a route: nobody, this origin only (the print sheets), or this
 * origin and the portfolio (the storefront).
 */
export function framingFor(pathname: string): "none" | "self" | "portfolio" {
  if (pathname.startsWith(PRINT_PATH_PREFIX)) return "self";
  const denied =
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/account" ||
    pathname.startsWith("/account/");
  return denied ? "none" : "portfolio";
}

/** Only the admin frames anything, and only its own print sheets. */
function framesOwnPages(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * 128 random bits, base64. The alphabet has to match Next's own extraction
 * regex (`[A-Za-z0-9+/_-]+={0,2}`) or Next silently renders without a nonce.
 */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * The single switch from report-only to enforcing. An environment variable
 * rather than a constant so that flipping — and flipping back, if a real
 * user hits a violation nobody saw in testing — is a Vercel setting and a
 * redeploy, not a code change.
 */
export function cspEnforced(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.CSP_ENFORCE === "true";
}

export type CspOptions = {
  nonce: string;
  pathname: string;
  /** `next dev`. React needs eval for its dev-only error overlays. */
  dev: boolean;
  /**
   * Served over HTTPS in production. Mirrors the HSTS condition in
   * next.config.ts: `next start` on http://localhost must not upgrade its own
   * subresources to an https:// that does not exist.
   */
  https: boolean;
  /** This deployment's origin; the report endpoint hangs off it. */
  origin: string;
};

/** Chromium's Reporting API delivers only to HTTPS endpoints. */
function reportsViaReportingApi(origin: string): boolean {
  return origin.startsWith("https://");
}

type Directives = [name: string, ...sources: string[]][];

function serialize(directives: Directives): string {
  return directives.map((parts) => parts.join(" ")).join("; ");
}

/**
 * The part of the policy that needs no nonce, enforced from next.config.ts
 * on every response in both rollout modes. These were already enforced
 * before the nonce policy existed (except per-route framing and
 * upgrade-insecure-requests, which browsers ignore in a report-only header),
 * so the report-only phase loosens nothing.
 *
 * Why next.config.ts and not the proxy: Next copies every header the proxy
 * puts on its response onto the request as well, and reads the nonce from the
 * request's `content-security-policy` before its `…-report-only`. A
 * nonce-less enforced header from the proxy would therefore hide the
 * report-only header's nonce from Next, and every script would render
 * without one. Headers from next.config.ts reach only the response.
 */
export function baselineDirectives({
  framing,
  https,
}: {
  framing: "none" | "self" | "portfolio";
  /**
   * Served over HTTPS in production. Mirrors the HSTS condition in
   * next.config.ts: `next start` on http://localhost must not upgrade its
   * own subresources to an https:// that does not exist.
   */
  https: boolean;
}): Directives {
  return [
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["object-src", "'none'"],
    [
      "frame-ancestors",
      ...(framing === "none"
        ? ["'none'"]
        : framing === "self"
          ? ["'self'"]
          : ["'self'", CSP_ORIGINS.portfolio]),
    ],
    ...(https ? ([["upgrade-insecure-requests"]] as Directives) : []),
  ];
}

/** Everything that restricts what the page itself may load and run. */
function fetchDirectives({
  nonce,
  dev,
  origin,
  pathname,
}: CspOptions): Directives {
  return [
    ["default-src", "'self'"],
    [
      "script-src",
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    /*
     * Styles are the compromise.
     *
     * - `style-src-attr 'unsafe-inline'`: React server-renders `style="…"`
     *   attributes (the root <html> sets font variables that way, and Base UI
     *   positions popovers with them). A nonce cannot cover an attribute, so
     *   the alternative is rewriting every inline style in the app.
     * - `style-src-elem`: <style> elements still need the nonce in
     *   production — Next stamps it on its own, and the fleet view's hoisted
     *   view-transition <style> and next-themes' transition-suppressing
     *   <style> are given it explicitly.
     * - `next dev` injects unnonced <style> tags for hot reload, so dev allows
     *   inline elements too. A nonce in the list would disable 'unsafe-inline'.
     * - `style-src` is the fallback for browsers without the -elem/-attr
     *   split (Safari before 15.4), which get the looser rule.
     *
     * CSS injection is a much smaller threat than script injection, and the
     * script policy stays strict regardless.
     */
    ["style-src", "'self'", "'unsafe-inline'"],
    [
      "style-src-elem",
      "'self'",
      ...(dev ? ["'unsafe-inline'"] : [`'nonce-${nonce}'`]),
    ],
    ["style-src-attr", "'unsafe-inline'"],
    // data: covers the inline SVG chevron in globals.css; blob: covers the
    // upload previews shown before a photo reaches Cloudinary.
    ["img-src", "'self'", "data:", "blob:", CSP_ORIGINS.cloudinaryDelivery],
    // next/font self-hosts Geist, so no font CDN.
    ["font-src", "'self'"],
    ["connect-src", "'self'", CSP_ORIGINS.cloudinaryUpload],
    // The admin loads its print sheets into a hidden same-origin frame.
    ["frame-src", framesOwnPages(pathname) ? "'self'" : "'none'"],
    /*
     * Both, because browsers split: Firefox and Safari only know report-uri;
     * Chromium prefers report-to and then ignores report-uri entirely. But
     * Chromium only delivers report-to to an HTTPS endpoint, so on plain
     * http (`next dev`, `next start` locally) naming the group would silence
     * reporting altogether. There report-uri alone is sent, which works.
     */
    ["report-uri", `${origin}${CSP_REPORT_PATH}`],
    ...(reportsViaReportingApi(origin)
      ? ([["report-to", CSP_REPORT_GROUP]] as Directives)
      : []),
  ];
}

/**
 * The nonce policy the proxy sends.
 *
 * Report-only (the default): the fetch directives alone, under
 * `Content-Security-Policy-Report-Only`; next.config.ts enforces the baseline
 * next to it. Enforcing: one `Content-Security-Policy` with the fetch
 * directives *and* the baseline, so that it stands on its own. next.config.ts
 * still sends its baseline too; a browser enforces every policy it receives,
 * and the baseline is a subset of this one, so the result is the same.
 */
export function nonceCsp(
  options: CspOptions,
  enforce: boolean
): {
  header: "Content-Security-Policy" | "Content-Security-Policy-Report-Only";
  value: string;
} {
  if (!enforce) {
    return {
      header: "Content-Security-Policy-Report-Only",
      value: serialize(fetchDirectives(options)),
    };
  }
  return {
    header: "Content-Security-Policy",
    value: serialize([
      ...fetchDirectives(options),
      ...baselineDirectives({
        framing: framingFor(options.pathname),
        https: options.https,
      }),
    ]),
  };
}

/** Everything the proxy sets on one response (and, through Next, its request). */
export function proxySecurityHeaders(
  options: CspOptions,
  enforce: boolean
): Record<string, string> {
  const csp = nonceCsp(options, enforce);
  return {
    [csp.header]: csp.value,
    ...(reportsViaReportingApi(options.origin) && {
      "Reporting-Endpoints": `${CSP_REPORT_GROUP}="${options.origin}${CSP_REPORT_PATH}"`,
    }),
  };
}

/*
 * Path patterns for next.config.ts, matching framingFor exactly and
 * exclusively: Next applies every rule whose source matches, so the admin
 * pattern leaves out the print sheets, and the storefront pattern is the
 * complement of both — no route gets two baselines.
 */
const DENIED_SOURCES = [
  "/admin",
  // Everything under /admin except the print sheets.
  "/admin/:path((?!print(?:/|$)).*)",
  // `:path*` matches zero or more segments, so these cover the root too.
  "/login/:path*",
  "/account/:path*",
];
const PRINT_SOURCE = "/admin/print/:path*";
const STOREFRONT_SOURCE = "/((?!(?:admin|login|account)(?:/|$)).*)";

/**
 * The route-scoped static headers, in next.config.ts `headers()` form.
 *
 * X-Frame-Options where framing is restricted: `DENY` is redundant with
 * `frame-ancestors 'none'`, and `SAMEORIGIN` with `'self'`, but both still
 * cover browsers that predate CSP2. The storefront sends none: the old
 * `ALLOW-FROM` value is ignored by every current browser, and `SAMEORIGIN`
 * would break the portfolio embed in the browsers that honour it.
 */
export function staticSecurityHeaders(https: boolean): {
  source: string;
  headers: { key: string; value: string }[];
}[] {
  const denied = serialize(baselineDirectives({ framing: "none", https }));
  const print = serialize(baselineDirectives({ framing: "self", https }));
  const storefront = serialize(
    baselineDirectives({ framing: "portfolio", https })
  );
  return [
    ...DENIED_SOURCES.map((source) => ({
      source,
      headers: [
        { key: "Content-Security-Policy", value: denied },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    })),
    {
      source: PRINT_SOURCE,
      headers: [
        { key: "Content-Security-Policy", value: print },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
      ],
    },
    {
      source: STOREFRONT_SOURCE,
      headers: [{ key: "Content-Security-Policy", value: storefront }],
    },
  ];
}
