import { NextResponse } from "next/server";

/**
 * Default-deny for the admin surface. Phase 4 replaces this with an
 * Auth.js session check; until then no dashboard route is reachable,
 * so partially built admin pages can never ship unprotected.
 */
export function middleware() {
  return new NextResponse(null, { status: 404 });
}

export const config = {
  matcher: ["/admin/:path*"],
};
