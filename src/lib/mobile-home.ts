import { UserRole } from "@prisma/client";

/** Phone / Expo users always land on the mobile dashboard; cards depend on role. */
export function mobileHomeForRole(_role?: string | UserRole | null) {
  return "/m";
}

export function isMobileLoginRequest(mobileFlag: string | null, callbackUrl: string | null) {
  if (mobileFlag === "1" || mobileFlag === "true") return true;
  if (callbackUrl?.startsWith("/m")) return true;
  return false;
}
