"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { dictionaries, Locale, LOCALES, TranslationKey } from "./dictionaries";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
  locales: typeof LOCALES;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = localStorage.getItem("hkai-locale") as Locale | null;
    if (saved && dictionaries[saved]) setLocaleState(saved);
  }, []);

  function setLocale(next: Locale) {
    setLocaleState(next);
    localStorage.setItem("hkai-locale", next);
    document.documentElement.lang = next;
  }

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => dictionaries[locale][key] ?? dictionaries.en[key] ?? key,
      locales: LOCALES,
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
