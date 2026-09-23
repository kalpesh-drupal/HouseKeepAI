import { CleaningStatus, RoomStatus } from "@prisma/client";

export const MOBILE_BREAKPOINT_PX = 900;

export function isMobileViewport(width = typeof window !== "undefined" ? window.innerWidth : 1024) {
  return width < MOBILE_BREAKPOINT_PX;
}

/** Map desktop app paths to mobile (/m) equivalents. */
export function desktopPathToMobile(pathname: string): string | null {
  if (pathname.startsWith("/m") || pathname.startsWith("/login") || pathname.startsWith("/onboarding")) {
    return null;
  }
  const routes: Record<string, string> = {
    "/dashboard": "/m",
    "/housekeeping": "/m/housekeeping",
    "/maintenance": "/m/maintenance",
    "/inspection": "/m/inspection",
    "/lost-found": "/m/lost-found",
    "/messages": "/m/messages",
    "/account": "/m/account",
  };
  if (routes[pathname]) return routes[pathname];
  const roomMatch = pathname.match(/^\/rooms\/([^/]+)$/);
  if (roomMatch) return `/m/rooms/${roomMatch[1]}`;
  return null;
}

export function canStartCleaning(status: RoomStatus, cleaningStatus: CleaningStatus) {
  if (status === RoomStatus.CLEANING || cleaningStatus === CleaningStatus.IN_PROGRESS) return false;
  return (
    status === RoomStatus.VACANT_DIRTY ||
    status === RoomStatus.OUT_OF_ORDER ||
    cleaningStatus === CleaningStatus.NOT_STARTED
  );
}

export function canFinishCleaning(status: RoomStatus, cleaningStatus: CleaningStatus) {
  return status === RoomStatus.CLEANING || cleaningStatus === CleaningStatus.IN_PROGRESS;
}
