"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { desktopPathToMobile, isMobileViewport } from "@/lib/mobile-routes";

/** Send narrow viewports (phone / dev tools device mode) to /m routes. */
export function MobileViewportRedirect() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function maybeRedirect() {
      if (!isMobileViewport()) return;
      const mobilePath = desktopPathToMobile(pathname);
      if (mobilePath && mobilePath !== pathname) {
        router.replace(mobilePath);
      }
    }

    maybeRedirect();
    window.addEventListener("resize", maybeRedirect);
    return () => window.removeEventListener("resize", maybeRedirect);
  }, [pathname, router]);

  return null;
}
