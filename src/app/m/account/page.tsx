import { requireAuth } from "@/lib/session";
import { ChangePasswordForm } from "@/components/change-password-form";

export default async function MobileAccountPage() {
  const session = await requireAuth(undefined, "/login?mobile=1&callbackUrl=/m/account");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Account</h2>
        <p className="text-sm text-muted-foreground">{session.user.email}</p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="mb-3 font-semibold">Change password</h3>
        <ChangePasswordForm compact />
      </div>
    </div>
  );
}
