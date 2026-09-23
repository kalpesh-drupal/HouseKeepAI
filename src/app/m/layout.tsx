import { requireAuth } from "@/lib/session";
import { MobileShell } from "@/components/mobile-shell";

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth(undefined, "/login?mobile=1&callbackUrl=/m");

  return (
    <MobileShell role={session.user.role} name={session.user.name || ""}>
      {children}
    </MobileShell>
  );
}
