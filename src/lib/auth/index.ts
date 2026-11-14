import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./config";
import { loginSchema } from "@/lib/validations/auth";
import { verifyCredentials } from "@/services/user.service";
import { clientIp, consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";
import {
  clearFailedSignIns,
  noteFailedSignIn,
} from "@/services/sign-in-alert.service";

/**
 * Failed sign-ins tolerated per IP per window. bcrypt makes each guess
 * expensive but not impossible; this makes a sustained attempt pointless.
 *
 * Keyed by IP, deliberately not by email: an email-keyed limiter lets an
 * attacker lock a real employee out of their own account by guessing at it
 * from anywhere. Only failures count, and a success clears the counter, so
 * someone fumbling their password then getting it right is never punished.
 *
 * The IP is the one clientIp derives: an IPv6 client's whole /64 shares a
 * bucket, so rotating through its own addresses buys it nothing. Guesses
 * spread across many networks still get past a per-IP limit, which is why
 * every refusal is also counted per account by noteFailedSignIn. That
 * counter alerts the admins and never refuses anyone (audit P2-1b).
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

        const ip = clientIp(new Headers(request.headers));
        const key = `login:${ip}`;
        const { allowed } = await consumeRateLimit(
          key,
          FAILED_LOGINS_PER_WINDOW,
          WINDOW_SECONDS
        );
        // Returning null surfaces the same generic message as a wrong
        // password. That is intentional: telling an attacker they have hit
        // a limit confirms they found a live endpoint worth resuming later.
        // A refusal by the IP limiter is still an attempt on the account.
        if (!allowed) {
          await noteFailedSignIn(parsed.data.email, ip);
          return null;
        }

        const user = await verifyCredentials(
          parsed.data.email,
          parsed.data.password
        );
        if (!user) {
          await noteFailedSignIn(parsed.data.email, ip);
          return null;
        }

        await resetRateLimit(key);
        await clearFailedSignIns(parsed.data.email);
        return user;
      },
    }),
  ],
});
