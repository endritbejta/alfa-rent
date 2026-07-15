import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./config";
import { loginSchema } from "@/lib/validations/auth";
import { verifyCredentials } from "@/services/user.service";

/**
 * Full Auth.js instance (Node runtime only — route handlers, server
 * components, server actions). The middleware must import config.ts
 * instead; this module pulls in Prisma and bcrypt.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        return verifyCredentials(parsed.data.email, parsed.data.password);
      },
    }),
  ],
});
