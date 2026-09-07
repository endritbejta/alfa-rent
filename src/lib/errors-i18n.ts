import "server-only";
import { AppError, normalizeError, type ErrorText } from "@/lib/errors";
import { getI18n } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";

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
 */
export async function errorMessage(error: unknown): Promise<string> {
  const text = error instanceof AppError ? error.text : undefined;
  if (!text) return normalizeError(error).body.error.message;

  const { dictionary } = await getI18n();
  return translate(dictionary, text.key, resolve(dictionary, text.values));
}

function resolve(
  dictionary: Parameters<typeof translate>[0],
  values: ErrorText["values"]
): Record<string, string | number> | undefined {
  if (!values) return undefined;
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      // A wrapped value is a translation key of its own — a status, a
      // category — and has to be read in the same language as the sentence
      // it lands in.
      typeof value === "object" ? translate(dictionary, value.key) : value,
    ])
  );
}
