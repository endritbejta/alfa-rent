"use client";

import { createContext, useCallback, useContext } from "react";
import type { Locale } from "@/lib/i18n/config";
import {
  translate,
  type TranslationDictionary,
  type TranslationKey,
} from "@/lib/i18n/translations";

type LocaleContextValue = {
  locale: Locale;
  dictionary: TranslationDictionary;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  dictionary,
  children,
}: LocaleContextValue & { children: React.ReactNode }) {
  return (
    <LocaleContext.Provider value={{ locale, dictionary }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useI18n must be used inside LocaleProvider");
  const t = useCallback(
    (key: TranslationKey, values?: Record<string, string | number>) =>
      translate(context.dictionary, key, values),
    [context.dictionary]
  );
  return {
    locale: context.locale,
    t,
  };
}
