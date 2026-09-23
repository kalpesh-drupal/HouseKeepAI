import { requireAuth } from "@/lib/session";
import { Sidebar } from "@/components/sidebar";
import { MobileViewportRedirect } from "@/components/mobile-viewport-redirect";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();

  return (
    <div className="flex min-h-screen">
      <MobileViewportRedirect />
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
