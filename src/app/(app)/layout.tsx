import { requireAuth } from "@/lib/session";
import { Sidebar } from "@/components/sidebar";
import { MobileViewportRedirect } from "@/components/mobile-viewport-redirect";
import { rollHotelDay } from "@/lib/day-roll";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  try {
    await rollHotelDay(session.user.hotelId);
  } catch (error) {
    console.error("Day roll failed", error);
  }

  return (
    <div className="flex min-h-screen">
      <MobileViewportRedirect />
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
