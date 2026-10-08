import { requireAuth } from "@/lib/session";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UsersAdminPanel } from "@/components/users-admin-panel";

export default async function StaffPage() {
  const session = await requireAuth([UserRole.OWNER, UserRole.GENERAL_MANAGER]);
  const [users, resetRequests] = await Promise.all([
    prisma.user.findMany({
      where: { hotelId: session.user.hotelId },
      select: { id: true, name: true, email: true, role: true, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.passwordResetRequest.findMany({
      where: { hotelId: session.user.hotelId, resolvedAt: null },
      include: { user: { select: { id: true, name: true, email: true, role: true, active: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Add Staff</h1>
        <p className="text-muted-foreground">
          Create a login for a housekeeper or other employee, then tell them the email and temporary password.
        </p>
      </div>
      <UsersAdminPanel users={users} resetRequests={resetRequests.map((request) => request.user)} />
    </div>
  );
}
