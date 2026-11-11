"use server";

import { signOut } from "@/lib/auth";
import { requireUser } from "@/lib/auth/guards";
import { TooManyRequestsError } from "@/lib/errors";
import { errorMessage } from "@/lib/errors-i18n";
import { consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { changeOwnPasswordSchema } from "@/lib/validations/staff";
import { changeOwnPassword } from "@/services/staff.service";

/**
 * Attempts per person per window. The form asks for the current password,
 * which makes it a way to test guesses at it for anyone who finds a signed-in
 * counter PC: enough attempts and they own the account after the session is
 * gone. Keyed by user rather than IP because only someone already signed in
 * as that person can reach it, so nobody else can lock them out with it.
 */
const ATTEMPTS_PER_WINDOW = 5;
const WINDOW_SECONDS = 15 * 60;

/** For anyone signed in, admin or not. Redirects to sign-in on success. */
export async function changeOwnPasswordAction(
  input: unknown
): Promise<{ error: string } | undefined> {
  try {
    const user = await requireUser();
    const { currentPassword, newPassword } =
      changeOwnPasswordSchema.parse(input);

    const key = `password-change:${user.id}`;
    const { allowed, retryAfter } = await consumeRateLimit(
      key,
      ATTEMPTS_PER_WINDOW,
      WINDOW_SECONDS
    );
    if (!allowed) throw new TooManyRequestsError(undefined, retryAfter);

    await changeOwnPassword(user.id, currentPassword, newPassword);
    await resetRateLimit(key);
  } catch (error) {
    return { error: await errorMessage(error) };
  }

  // The change moved sessionVersion on, so this session is already over. Its
  // cookie is cleared here, outside the try so the redirect reaches Next, and
  // the sign-in page says why the person is looking at it.
  await signOut({ redirectTo: "/login?notice=password-changed" });
}
