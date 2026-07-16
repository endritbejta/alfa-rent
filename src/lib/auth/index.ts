import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./config";
import { loginSchema } from "@/lib/validations/auth";
import { verifyCredentials } from "@/services/user.service";
import { clientIp, consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";

/**
 * Failed sign-ins tolerated per IP per window. bcrypt makes each guess
 * expensive but not impossible; this makes a sustained attempt pointless.
 *
 * Keyed by IP, deliberately not by email: an email-keyed limiter lets an
 * attacker lock a real employee out of their own account by guessing at it
 * from anywhere. Only failures count, and a success clears the counter, so
 * someone fumbling their password then getting it right is never punished.
 */
const FAILED_LOGINS_PER_WINDOW = 10;
const WINDOW_SECONDS = 15 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const key = `login:${clientIp(new Headers(request.headers))}`;
        const { allowed } = await consumeRateLimit(
          key,
          FAILED_LOGINS_PER_WINDOW,
          WINDOW_SECONDS
        );
        // Returning null surfaces the same generic message as a wrong
        // password. That is intentional: telling an attacker they have hit
        // a limit confirms they found a live endpoint worth resuming later.
        if (!allowed) return null;

        const user = await verifyCredentials(
          parsed.data.email,
          parsed.data.password
        );
        if (!user) return null;

        await resetRateLimit(key);
        return user;
      },
    }),
  ],
});
