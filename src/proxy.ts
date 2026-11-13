import NextAuth from "next-auth";
import {
  NextResponse,
  type NextFetchEvent,
  type NextMiddleware,
  type NextRequest,
} from "next/server";
import { authConfig } from "@/lib/auth/config";
import { createNonce, cspEnforced, proxySecurityHeaders } from "@/lib/csp";

/**
 * Coarse session perimeter for the admin surface. Authorization remains in
 * server-side guards because Proxy is never the only security boundary.
 */
const { auth } = NextAuth(authConfig);

/*
 * `auth` used to be this file's default export, which Next calls as
 * `(request, event)`. Calling it the same way keeps the redirect and the
 * session-cookie renewal exactly as they were; the cast only names the
 * overload Auth.js does not type.
 */
const adminPerimeter = auth as unknown as NextMiddleware;

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * The perimeter, then the per-request security headers.
 *
 * Auth.js still runs on `/admin` only. The matcher below is wider so that
 * every page gets a fresh CSP nonce, but running the session check on the
 * storefront would renew the staff cookie on every public page view and
 * quietly stretch the twelve-hour idle timeout.
 */
export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent
): Promise<Response> {
  const { pathname } = request.nextUrl;
  const nonce = createNonce();
  // `https` is only consulted when enforcing (upgrade-insecure-requests).
  const options = {
    nonce,
    pathname,
    dev: process.env.NODE_ENV === "development",
    https:
      process.env.NODE_ENV === "production" &&
      !!process.env.AUTH_URL?.startsWith("https://"),
    origin: request.nextUrl.origin,
  };
  const headers = proxySecurityHeaders(options, cspEnforced());

  let authResponse: Response | null = null;
  if (isAdminPath(pathname)) {
    authResponse = (await adminPerimeter(request, event)) ?? null;
    // Anything other than "carry on" is the sign-in redirect: send it as is.
    if (authResponse && authResponse.headers.get("x-middleware-next") !== "1") {
      for (const [key, value] of Object.entries(headers)) {
        authResponse.headers.set(key, value);
      }
      return authResponse;
    }
  }

  /*
   * Next reads the nonce from the request's CSP header (enforcing or
   * report-only) and stamps it on its own scripts; `x-nonce` is for the
   * layout to hand to next-themes. Next would copy the response headers
   * below onto the request anyway, but saying so here is clearer than
   * relying on it. A CSP header the client sent itself is dropped, since
   * Next reads the enforcing one first.
   */
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("content-security-policy");
  requestHeaders.delete("content-security-policy-report-only");
  requestHeaders.set("x-nonce", nonce);
  for (const [key, value] of Object.entries(headers)) {
    if (key.startsWith("Content-Security-Policy"))
      requestHeaders.set(key, value);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  // The renewed session cookie, which is the perimeter's other job.
  for (const cookie of authResponse?.headers.getSetCookie() ?? []) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Every page and every admin request, but not:
     * - api: route handlers return JSON, not documents
     * - _next/static, _next/image: build assets
     * - anything with a file extension: public/ files, favicon, robots.txt,
     *   sitemap.xml
     */
    "/((?!api/|_next/static|_next/image|.*\\.[A-Za-z0-9]+$).*)",
    // The perimeter's original matcher, kept verbatim so no admin URL can
    // fall through the exclusions above.
    "/admin/:path*",
  ],
};
