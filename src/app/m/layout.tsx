import { requireAuth } from "@/lib/session";
import { MobileShell } from "@/components/mobile-shell";
import { rollHotelDay } from "@/lib/day-roll";

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth(undefined, "/login?mobile=1&callbackUrl=/m");
  try {
    await rollHotelDay(session.user.hotelId);
  } catch (error) {
    console.error("Day roll failed", error);
  }

  return (
    <MobileShell role={session.user.role} name={session.user.name || ""}>
      {children}
    </MobileShell>
  );
}
