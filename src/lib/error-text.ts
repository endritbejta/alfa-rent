import { AppError, type ErrorText } from "@/lib/errors";
import type { Locale } from "@/lib/i18n/config";
import {
  dictionaries,
  translate,
  type TranslationDictionary,
} from "@/lib/i18n/translations";

/**
 * An error's named message (ErrorText) said in one language. Pure: no
 * cookie, no request. errors-i18n.ts resolves the reader's locale and calls
 * this; a route that already knows the locale calls it directly.
 */
export function translateErrorText(
  dictionary: TranslationDictionary,
  text: ErrorText
): string {
  return translate(dictionary, text.key, resolve(dictionary, text.values));
}

/**
 * An AppError's message in a given language, or null when the error names
 * none and the caller should keep the English sentence. Unlike errorMessage
 * it never falls back to the default language: the booking route calls it
 * only with the storefront's cookie, and a caller without one is the public
 * JSON API, which answers in English.
 */
export function errorMessageIn(error: unknown, locale: Locale): string | null {
  const text = error instanceof AppError ? error.text : undefined;
  return text ? translateErrorText(dictionaries[locale], text) : null;
}

function resolve(
  dictionary: TranslationDictionary,
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
