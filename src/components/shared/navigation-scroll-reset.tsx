"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Next.js normally resets scroll during Link navigation, but its scroll
 * heuristic can preserve the viewport when persistent layouts remain visible.
 * Make the product-wide rule explicit: every pathname change starts at the top.
 */
export function NavigationScrollReset() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current === pathname) return;

    previousPathname.current = pathname;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}
