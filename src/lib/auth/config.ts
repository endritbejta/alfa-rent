import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe base config: no Prisma, no bcrypt. The middleware imports
 * this file only, so the credentials provider (Node-only) never ends up
 * in the edge bundle. JWT strategy is required for credentials auth and
 * lets the middleware validate sessions without a database roundtrip.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");
      if (!isAdminRoute) return true;
      return (
        !!auth?.user &&
        Number.isInteger(auth.user.sessionVersion) &&
        typeof auth.user.id === "string" &&
        auth.user.id.length > 0
      );
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.sessionVersion = user.sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      session.user.role = token.role;
      session.user.sessionVersion = token.sessionVersion;
      return session;
    },
  },
} satisfies NextAuthConfig;
