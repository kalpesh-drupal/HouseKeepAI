"use client";

import { useI18n } from "@/lib/i18n/context";

export function LanguageSwitcher({ compact }: { compact?: boolean }) {
  const { locale, setLocale, locales, t } = useI18n();

  return (
    <label className={`flex items-center gap-2 text-sm ${compact ? "" : "w-full"}`}>
      {!compact && <span className="text-muted-foreground">{t("language")}</span>}
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as typeof locale)}
        className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm"
      >
        {locales.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
