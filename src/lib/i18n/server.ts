import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "./config";
import { dictionaries, translate } from "./translations";

export async function getLocale() {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getI18n() {
  const locale = await getLocale();
  const dictionary = dictionaries[locale];
  return {
    locale,
    dictionary,
    t: (
      key: Parameters<typeof translate>[1],
      values?: Parameters<typeof translate>[2]
    ) => translate(dictionary, key, values),
  };
}
