"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Sparkles, Wrench, ClipboardCheck, Languages, Search, MessageSquare, Home, LogOut, KeyRound } from "lucide-react";
import { UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/context";

export function MobileShell({
  children,
  role,
  name,
}: {
  children: React.ReactNode;
  role: UserRole;
  name: string;
}) {
  const pathname = usePathname();
  const { t } = useI18n();

  const tabs = [
    { href: "/m", label: "Home", icon: Home, show: true },
    { href: "/m/housekeeping", label: t("housekeeping"), icon: Sparkles, show: ["HOUSEKEEPER", "EXECUTIVE_HOUSEKEEPER", "OWNER", "GENERAL_MANAGER"].includes(role) },
    { href: "/m/maintenance", label: t("maintenance"), icon: Wrench, show: ["MAINTENANCE", "OWNER", "GENERAL_MANAGER", "FRONT_DESK"].includes(role) },
    { href: "/m/inspection", label: t("inspection"), icon: ClipboardCheck, show: ["INSPECTOR", "EXECUTIVE_HOUSEKEEPER", "OWNER", "GENERAL_MANAGER"].includes(role) },
    { href: "/m/lost-found", label: t("lostFound"), icon: Search, show: ["HOUSEKEEPER", "FRONT_DESK", "EXECUTIVE_HOUSEKEEPER", "GENERAL_MANAGER", "OWNER", "MAINTENANCE", "INSPECTOR"].includes(role) },
    { href: "/m/messages", label: t("messages"), icon: MessageSquare, show: true },
  ].filter((tab) => tab.show);

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">{t("mobileApp")}</p>
            <h1 className="font-bold">{name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 text-muted-foreground" />
            <LanguageSwitcher compact />
            <Link href="/m/account" className="rounded-lg bg-muted p-2" title="Change password">
              <KeyRound className="h-4 w-4" />
            </Link>
            <button
              type="button"
              title="Sign out"
              onClick={() => signOut({ callbackUrl: "/login?mobile=1&callbackUrl=/m" })}
              className="rounded-lg bg-muted p-2"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 pb-24">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-card">
        <div className="mx-auto flex max-w-lg">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.href === "/m" ? pathname === "/m" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium leading-tight",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="line-clamp-2 text-center">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
