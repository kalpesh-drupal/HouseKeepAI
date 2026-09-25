/** Phone / Expo users always land on the mobile dashboard. */
export function mobileHomeForRole() {
  return "/m";
}

export function isMobileLoginRequest(mobileFlag: string | null, callbackUrl: string | null) {
  if (mobileFlag === "1" || mobileFlag === "true") return true;
  if (callbackUrl?.startsWith("/m")) return true;
  return false;
}
