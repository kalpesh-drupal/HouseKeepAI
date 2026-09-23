import { requireAuth } from "@/lib/session";
import { ChangePasswordForm } from "@/components/change-password-form";

export default async function AccountPage() {
  const session = await requireAuth();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Account</h1>
        <p className="text-muted-foreground">
          {session.user.name} · {session.user.email}
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
