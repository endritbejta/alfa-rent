import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@prisma/client";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

/**
 * Returns the user on valid credentials, null otherwise. The caller gets
 * no signal for "wrong email" vs "wrong password" — that distinction is
 * an account-enumeration vector. The dummy compare keeps timing similar
 * whether or not the email exists.
 */
export async function verifyCredentials(
  email: string,
  password: string
): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  const hash =
    user?.password ??
    "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpDDQrGRnMUCIDGNMOl3cJdKO0uO2";
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
