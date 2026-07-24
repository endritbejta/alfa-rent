import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

/**
 * Coarse session perimeter for the admin surface. Authorization remains in
 * server-side guards because Proxy is never the only security boundary.
 */
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: ["/admin/:path*"],
};
