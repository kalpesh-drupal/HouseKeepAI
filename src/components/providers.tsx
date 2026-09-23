"use client";

import { SessionProvider } from "next-auth/react";
import { I18nProvider } from "@/lib/i18n/context";
import { OfflineBanner } from "@/components/offline-banner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={5 * 60}>
      <I18nProvider>
        <OfflineBanner />
        {children}
      </I18nProvider>
    </SessionProvider>
  );
}
