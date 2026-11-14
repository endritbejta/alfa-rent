import type { ErrorText } from "@/lib/errors";
import { translate, type TranslationDictionary } from "@/lib/i18n/translations";

/**
 * An error's named message (ErrorText) said in one language. Pure: no
 * cookie, no request. errors-i18n.ts resolves the reader's locale and calls
 * this.
 */
export function translateErrorText(
  dictionary: TranslationDictionary,
  text: ErrorText
): string {
  return translate(dictionary, text.key, resolve(dictionary, text.values));
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
