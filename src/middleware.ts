import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

/**
 * Session gate for the admin surface. Uses the edge-safe config (JWT
 * check only, no database); unauthenticated requests are redirected to
 * /login by the authorized() callback. Role-level enforcement happens
 * in the server-side guards, not here — the middleware is a coarse
 * perimeter, not the authorization system.
 */
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: ["/admin/:path*"],
};
