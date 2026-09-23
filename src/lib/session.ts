import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./auth";
import { UserRole } from "@prisma/client";

export async function getSession() {
  return getServerSession(authOptions);
}

export async function requireAuth(allowedRoles?: UserRole[], loginPath = "/login") {
  const session = await getSession();
  if (!session?.user) {
    redirect(loginPath);
  }
  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    redirect("/dashboard");
  }
  return session;
}
