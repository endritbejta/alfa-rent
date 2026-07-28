export const locales = ["sq", "en"] as const;
export type Locale = (typeof locales)[number];

export const DEFAULT_LOCALE: Locale = "sq";
export const LOCALE_COOKIE = "alfa-locale";
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale);
}
