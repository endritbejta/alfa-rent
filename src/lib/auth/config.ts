import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe base config: no Prisma, no bcrypt. The middleware imports
 * this file only, so the credentials provider (Node-only) never ends up
 * in the edge bundle. JWT strategy is required for credentials auth and
 * lets the middleware validate sessions without a database roundtrip.
 */
/**
 * How long a staff session survives unused: twelve hours, not Auth.js's
 * default thirty days.
 *
 * The admin runs on shared counter machines, and a tab left open used to stay
 * signed in for a month. With JWT sessions, every request through the proxy
 * re-issues the cookie with a fresh expiry, so this is an idle timeout. A
 * shift in use never meets it, and the next morning's first visit asks for
 * the password again. (`updateAge` is not set because only database sessions
 * read it.)
 */
export const SESSION_IDLE_SECONDS = 12 * 60 * 60;

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: SESSION_IDLE_SECONDS,
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");
      if (!isAdminRoute) return true;
      /*
       * Server Actions go through to their own guards. Every one of them calls
       * requireUser or requireRole, and an action can be posted to any URL, the
       * storefront's included, so this redirect never protected one. It broke
       * them instead: the browser followed it to the sign-in page's HTML where
       * Next expects a Flight response, and an expired session surfaced as "An
       * unexpected response was received from the server". The guard's own
       * redirect() is one Next turns into a navigation. Passing through here
       * still renews the session cookie, which nothing else does.
       */
      if (request.method === "POST" && request.headers.has("next-action")) {
        return true;
      }
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
