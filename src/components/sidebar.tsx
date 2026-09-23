"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Map,
  Sparkles,
  ClipboardCheck,
  Wrench,
  ConciergeBell,
  MessageSquare,
  Settings,
  LogOut,
  Hotel,
  Package,
  Shirt,
  Search,
  Bell,
  BarChart3,
  Bot,
  Upload,
  Plug,
  Smartphone,
  KeyRound,
} from "lucide-react";
import { NAV_ITEMS, ROLE_LABELS, canAccessNav, cn } from "@/lib/utils";
import { UserRole } from "@prisma/client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/context";
import { TranslationKey } from "@/lib/i18n/dictionaries";

const iconMap = {
  LayoutDashboard,
  Map,
  Sparkles,
  ClipboardCheck,
  Wrench,
  ConciergeBell,
  MessageSquare,
  Settings,
  Package,
  Shirt,
  Search,
  Bell,
  BarChart3,
  Bot,
  Upload,
  Plug,
  Smartphone,
  KeyRound,
};

const NAV_I18N: Record<string, TranslationKey> = {
  "/dashboard": "dashboard",
  "/map": "hotelMap",
  "/housekeeping": "housekeeping",
  "/inspection": "inspection",
  "/maintenance": "maintenance",
  "/front-desk": "frontDesk",
  "/guest-requests": "guestRequests",
  "/inventory": "inventory",
  "/laundry": "laundry",
  "/lost-found": "lostFound",
  "/reports": "reports",
  "/ai": "aiAssistant",
  "/upload": "upload",
  "/pms": "pms",
  "/m": "mobileApp",
  "/messages": "messages",
  "/settings": "settings",
};

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role as UserRole | undefined;
  const { t } = useI18n();

  if (!session?.user || !role) return null;

  const user = session.user;

  const visibleNav = NAV_ITEMS.filter((item) => canAccessNav(role, item.roles));

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary p-2 text-white">
            <Hotel className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-bold text-foreground">{t("appName")}</h1>
            <p className="text-xs text-muted-foreground">{user.hotelName}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {visibleNav.map((item) => {
          const Icon = iconMap[item.icon as keyof typeof iconMap];
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const labelKey = NAV_I18N[item.href];
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition",
                active ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {labelKey ? t(labelKey) : item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4 space-y-3">
        <LanguageSwitcher />
        <div className="rounded-xl bg-muted p-4">
          <p className="font-medium">{user.name}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-2 rounded-xl px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          {t("signOut")}
        </button>
      </div>
    </aside>
  );
}
