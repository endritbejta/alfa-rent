import "server-only";
import { unstable_rethrow } from "next/navigation";
import { AppError, normalizeError } from "@/lib/errors";
import { getI18n } from "@/lib/i18n/server";
import { translateErrorText } from "@/lib/error-text";

/**
 * The message an operator should read, in their own language.
 *
 * This is the boundary the service layer's `ErrorText` is resolved at: a
 * server action or a route handler knows the request, and therefore the
 * locale cookie, where the service does not.
 *
 * A throw with no `text` falls back to `normalizeError`, which is what it did
 * before — so wiring a call site up costs nothing until the throw it catches
 * is given a key, and an untranslated message shows its English sentence
 * rather than nothing at all.
 *
 * Next's own control flow is never turned into a message. A redirect() (the
 * sign-in redirect requireUser issues for an expired session) or a notFound()
 * thrown inside a try has to reach Next, or the operator gets "An unexpected
 * error occurred" where they should have been sent to sign in. Every server
 * action's catch goes through here, so rethrowing in this one place covers
 * them all.
 */
export async function errorMessage(error: unknown): Promise<string> {
  unstable_rethrow(error);
  const text = error instanceof AppError ? error.text : undefined;
  if (!text) return normalizeError(error).body.error.message;

  const { dictionary } = await getI18n();
  return translateErrorText(dictionary, text);
}
