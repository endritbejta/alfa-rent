"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a media query matches, kept current as the window changes.
 *
 * Through useSyncExternalStore rather than an effect, so there is no
 * setState-in-effect for the lint rule to forbid and no frame where the old
 * answer is rendered. The server has no window and answers `false`; only
 * read this for things that exist after hydration, such as an overlay's
 * gesture direction.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}
